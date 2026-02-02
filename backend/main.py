import json
import os
import time
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.analytics import (
    get_course_id_for_flow,
    get_ai_flow,
    get_ai_spec,
    get_course,
    get_teacher_report,
    init_db,
    delete_user,
    list_approved_flows,
    list_courses,
    list_courses_for_user,
    list_course_students,
    list_users,
    mark_ai_flow_approved,
    reset_auth_data,
    reset_flow_data,
    reset_learning_data,
    save_ai_flow,
    save_ai_spec,
    set_course_students,
    set_course_flow,
    set_user_courses,
    user_has_course,
)
from engine.ai_generation import AIFlowError, generate_flow, generate_spec, now_label
from engine.db import is_postgres
from engine.auth import (
    AuthError,
    create_session,
    create_user,
    create_user_verified,
    create_email_verification,
    create_password_reset,
    delete_session,
    get_user_by_email,
    get_user_by_session,
    get_user_by_username,
    mark_user_verified,
    mark_password_reset_used,
    send_verification_email,
    send_password_reset_email,
    sign_session,
    update_user_password,
    verify_password,
    verify_email_code,
    verify_password_reset,
    verify_signed_session,
)
from engine.loader import FlowValidationError, load_flows, validate_flow
from engine.runner import advance_session, analyze_attempts, start_session, submit_answer


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
_flows_env = os.environ.get("FLOWS_PATH", "").strip()
if _flows_env:
    FLOWS_DIR = Path(_flows_env)
else:
    primary_flows = ROOT_DIR / "shared" / "flows"
    fallback_flows = BASE_DIR / "shared" / "flows"
    FLOWS_DIR = primary_flows if primary_flows.exists() else fallback_flows
DB_PATH = os.environ.get(
    "DATABASE_URL",
    os.environ.get("DATABASE_PATH", str(ROOT_DIR / "backend" / "storage" / "app.db")),
)
REPORTS_PATH = os.environ.get("REPORTS_PATH", str(ROOT_DIR / "backend" / "reports"))
AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "86400"))
RESET_TOKEN_TTL_SECONDS = int(os.environ.get("RESET_TOKEN_TTL_SECONDS", "3600"))
VERIFY_CODE_TTL_SECONDS = int(os.environ.get("VERIFY_CODE_TTL_SECONDS", "600"))
RESET_LINK_BASE = os.environ.get("RESET_LINK_BASE", "http://localhost:5173")
ADMIN_RESET_TOKEN = os.environ.get("ADMIN_RESET_TOKEN", "")
ADMIN_FLOW_TOKEN = os.environ.get("ADMIN_FLOW_TOKEN", "")
ADMIN_EMAILS = [
    email.strip().lower()
    for email in os.environ.get("ADMIN_EMAILS", "").split(",")
    if email.strip()
]
ADMIN_USERNAMES = [
    username.strip().lower()
    for username in os.environ.get("ADMIN_USERNAMES", "").split(",")
    if username.strip()
]
COOKIE_NAME = "session_token"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
ENV = os.environ.get("ENV", "dev")
SECURE_COOKIES = ENV.lower() == "production"
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX = 20
_rate_limit_store: dict[str, list[float]] = {}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartSessionRequest(BaseModel):
    flow_id: str
    student_id: str


class SubmitRequest(BaseModel):
    step_id: str
    response: str
    time_spent_ms: int
    skipped: bool = False


class SignupRequest(BaseModel):
    username: str
    password: str
    email: str
    confirm_password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class AdminResetRequest(BaseModel):
    token: str
    mode: str = "auth"


class AdminFlowResetRequest(BaseModel):
    token: str


class AdminSpecRequest(BaseModel):
    token: str
    topic: str
    course_id: str


class AdminSpecApproveRequest(BaseModel):
    token: str
    spec_id: str
    spec_override: dict | None = None


class AdminFlowApproveRequest(BaseModel):
    token: str
    flow_id: str


class AdminFlowPreviewRequest(BaseModel):
    token: str
    flow_id: str


class AdminEmailStatusRequest(BaseModel):
    token: str


class AdminCreateUsersRequest(BaseModel):
    token: str
    users: list[dict]


class AdminUsersRequest(BaseModel):
    token: str


class AdminUserDeleteRequest(BaseModel):
    token: str
    username: str


class AdminCourseStudentsRequest(BaseModel):
    token: str
    course_id: str


class AdminCourseStudentsSetRequest(BaseModel):
    token: str
    course_id: str
    student_ids: list[int]


class SessionAnalysisRequest(BaseModel):
    step_id: str


class SessionAdvanceRequest(BaseModel):
    next_step_id: str | None = None


@app.on_event("startup")
def startup() -> None:
    if not is_postgres(DB_PATH):
        Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORTS_PATH).mkdir(parents=True, exist_ok=True)
    init_db(DB_PATH)
    try:
        flows = {}
        for record in list_approved_flows(DB_PATH):
            flow = record["flow"]
            validate_flow(flow, source=f"db:{record['id']}")
            flows[flow["id"]] = flow
    except FlowValidationError as exc:
        raise RuntimeError(str(exc)) from exc
    app.state.flows = flows


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="none" if SECURE_COOKIES else "lax",
        max_age=SESSION_TTL_SECONDS,
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


def _rate_limit(request: Request, action: str) -> None:
    now = time.time()
    key = f"{request.client.host}:{action}"
    timestamps = [ts for ts in _rate_limit_store.get(key, []) if now - ts < RATE_LIMIT_WINDOW_SECONDS]
    if len(timestamps) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests")
    timestamps.append(now)
    _rate_limit_store[key] = timestamps


def _reload_flows() -> None:
    flows = {}
    for record in list_approved_flows(DB_PATH):
        flow = record["flow"]
        try:
            validate_flow(flow, source=f"db:{record['id']}")
        except FlowValidationError:
            continue
        flows[flow["id"]] = flow
    app.state.flows = flows


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    session_id = verify_signed_session(token, AUTH_SECRET)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = get_user_by_session(DB_PATH, session_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def is_admin_user(user: dict) -> bool:
    email = (user.get("email") or "").lower()
    username = (user.get("username") or "").lower()
    return (bool(email) and email in ADMIN_EMAILS) or (
        bool(username) and username in ADMIN_USERNAMES
    )


def _with_admin_flag(users: list[dict]) -> list[dict]:
    return [{**user, "is_admin": is_admin_user(user)} for user in users]


def _require_admin_or_flow_token(token: str, user: dict) -> None:
    if token and ADMIN_FLOW_TOKEN and token == ADMIN_FLOW_TOKEN:
        return
    if user and is_admin_user(user):
        return
    raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/flows")
def list_flows() -> list[dict]:
    approved = list_approved_flows(DB_PATH)
    flows = {record["flow"]["id"]: record["flow"] for record in approved}
    app.state.flows = flows
    return [
        {"id": flow["id"], "title": flow["title"], "topic": flow["topic"]}
        for flow in flows.values()
    ]


@app.get("/courses")
def list_courses_endpoint(user: dict = Depends(get_current_user)) -> list[dict]:
    if is_admin_user(user):
        return list_courses(DB_PATH)
    return list_courses_for_user(DB_PATH, user["id"])


@app.post("/session/start")
def session_start(payload: StartSessionRequest, user: dict = Depends(get_current_user)) -> dict:
    flows = app.state.flows
    flow = flows.get(payload.flow_id)
    if flow is None:
        record = get_ai_flow(DB_PATH, payload.flow_id)
        if record:
            flow = record["flow"]
            try:
                validate_flow(flow, source=f"db:{payload.flow_id}")
            except FlowValidationError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            flows[payload.flow_id] = flow
            app.state.flows = flows
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if not is_admin_user(user):
        course_id = get_course_id_for_flow(DB_PATH, payload.flow_id)
        if not course_id:
            raise HTTPException(status_code=403, detail="Flow is not assigned to a course")
        if not user_has_course(DB_PATH, user["id"], course_id):
            raise HTTPException(status_code=403, detail="Not enrolled in this course")
    session_id, step = start_session(flow, user["username"], DB_PATH)
    return {
        "session_id": session_id,
        "flow": {
            "id": flow["id"],
            "title": flow["title"],
            "statement": flow["statement"],
            "total_steps": len(flow.get("steps", {})),
        },
        "step": step,
    }


@app.post("/session/{session_id}/submit")
def submit(
    session_id: str,
    payload: SubmitRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    _rate_limit(request, "submit")
    flows = app.state.flows
    for flow in flows.values():
        try:
            result = submit_answer(
                session_id=session_id,
                flow=flow,
                step_id=payload.step_id,
                response=payload.response,
                skipped=payload.skipped,
                time_spent_ms=payload.time_spent_ms,
                db_path=DB_PATH,
                expected_student_id=user["username"],
            )
            return result
        except ValueError as exc:
            error = str(exc)
            if error in {"Session not found", "Session already completed"}:
                continue
            raise HTTPException(status_code=400, detail=error) from exc

    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/session/{session_id}/analysis")
def analyze_session_attempts(
    session_id: str,
    payload: SessionAnalysisRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    _rate_limit(request, "analysis")
    flows = app.state.flows
    for flow in flows.values():
        try:
            correction_help = analyze_attempts(
                session_id=session_id,
                flow=flow,
                step_id=payload.step_id,
                db_path=DB_PATH,
                expected_student_id=user["username"],
            )
            return {"correctionHelp": correction_help}
        except ValueError as exc:
            error = str(exc)
            if error in {"Session not found", "Step not found in flow"}:
                continue
            raise HTTPException(status_code=400, detail=error) from exc
    raise HTTPException(status_code=404, detail="Session not found")


@app.post("/session/{session_id}/advance")
def advance_session_step(
    session_id: str,
    payload: SessionAdvanceRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    _rate_limit(request, "advance")
    flows = app.state.flows
    for flow in flows.values():
        try:
            advance_session(
                session_id=session_id,
                flow=flow,
                next_step_id=payload.next_step_id,
                db_path=DB_PATH,
                expected_student_id=user["username"],
            )
            return {"success": True}
        except ValueError as exc:
            error = str(exc)
            if error in {"Session not found", "Step not found in flow"}:
                continue
            raise HTTPException(status_code=400, detail=error) from exc
    raise HTTPException(status_code=404, detail="Session not found")


@app.get("/teacher/report")
def teacher_report(flow_id: str, user: dict = Depends(get_current_user)) -> dict:
    flows = app.state.flows
    flow = flows.get(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    steps = [flow["steps"][step_id] for step_id in flow["steps"].keys()]
    return get_teacher_report(DB_PATH, flow_id, steps)


@app.post("/auth/signup")
def auth_signup(payload: SignupRequest, response: Response, request: Request) -> dict:
    raise HTTPException(status_code=403, detail="Signup is disabled")


@app.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response, request: Request) -> dict:
    _rate_limit(request, "login")
    user = get_user_by_username(DB_PATH, payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("verified_at"):
        raise HTTPException(status_code=403, detail="Email not verified")
    session = create_session(DB_PATH, user["id"], SESSION_TTL_SECONDS)
    token = sign_session(session["session_id"], AUTH_SECRET)
    _set_session_cookie(response, token)
    return {
        "username": user["username"],
        "email": user.get("email"),
        "is_admin": is_admin_user(user),
    }


@app.post("/auth/logout")
def auth_logout(response: Response, request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    session_id = verify_signed_session(token, AUTH_SECRET)
    if session_id:
        delete_session(DB_PATH, session_id)
    _clear_session_cookie(response)
    return {"success": True}


@app.get("/auth/me")
def auth_me(user: dict = Depends(get_current_user)) -> dict:
    return {
        "username": user["username"],
        "email": user.get("email"),
        "is_admin": is_admin_user(user),
    }


@app.post("/auth/forgot")
def auth_forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> dict:
    _rate_limit(request, "forgot")
    email = payload.email.strip().lower()
    user = get_user_by_email(DB_PATH, email)
    if user:
        token = create_password_reset(DB_PATH, user["id"], RESET_TOKEN_TTL_SECONDS)
        reset_link = f"{RESET_LINK_BASE}?reset_token={token}"
        background_tasks.add_task(send_password_reset_email, email, reset_link)
    return {"success": True}


@app.post("/auth/reset")
def auth_reset_password(payload: ResetPasswordRequest, request: Request) -> dict:
    _rate_limit(request, "reset")
    reset = verify_password_reset(DB_PATH, payload.token)
    if not reset:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    update_user_password(DB_PATH, reset["user_id"], payload.new_password)
    mark_password_reset_used(DB_PATH, reset["id"])
    return {"success": True}


@app.post("/auth/verify")
def auth_verify_email(
    payload: VerifyEmailRequest,
    response: Response,
    request: Request,
) -> dict:
    raise HTTPException(status_code=403, detail="Email verification is disabled")


@app.post("/admin/reset")
def admin_reset(payload: AdminResetRequest) -> dict:
    if not ADMIN_RESET_TOKEN or payload.token != ADMIN_RESET_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    mode = payload.mode.lower()
    if mode == "auth":
        reset_auth_data(DB_PATH)
    elif mode == "learning":
        reset_learning_data(DB_PATH)
    elif mode == "all":
        reset_learning_data(DB_PATH)
        reset_auth_data(DB_PATH)
    else:
        raise HTTPException(status_code=400, detail="Invalid mode")
    return {"success": True, "mode": mode}


@app.post("/admin/flows/reset")
def admin_flows_reset(payload: AdminFlowResetRequest) -> dict:
    if not ADMIN_RESET_TOKEN or payload.token != ADMIN_RESET_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    reset_flow_data(DB_PATH)
    deleted = 0
    try:
        for path in FLOWS_DIR.glob("*.json"):
            path.unlink(missing_ok=True)
            deleted += 1
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed deleting flow files: {exc}") from exc
    _reload_flows()
    return {"success": True, "deleted_files": deleted}


@app.post("/admin/ai/spec")
def admin_ai_spec(payload: AdminSpecRequest) -> dict:
    if not ADMIN_FLOW_TOKEN or payload.token != ADMIN_FLOW_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    course = get_course(DB_PATH, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    try:
        spec = generate_spec(payload.topic, course)
    except AIFlowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    spec_id = f"spec-{payload.course_id}-{now_label()}"
    save_ai_spec(DB_PATH, spec_id, payload.course_id, payload.topic, spec)
    return {"spec_id": spec_id, "spec": spec}


@app.post("/admin/ai/spec/approve")
def admin_ai_spec_approve(payload: AdminSpecApproveRequest) -> dict:
    if not ADMIN_FLOW_TOKEN or payload.token != ADMIN_FLOW_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    record = get_ai_spec(DB_PATH, payload.spec_id)
    if not record:
        raise HTTPException(status_code=404, detail="Spec not found")
    spec = payload.spec_override if payload.spec_override else record["spec"]
    flow_id = f"{record['course_id']}-{now_label()}"
    try:
        flow = generate_flow(spec, flow_id)
        validate_flow(flow, source="ai")
    except (AIFlowError, FlowValidationError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_ai_flow(DB_PATH, flow_id, record["id"], record["course_id"], flow)
    return {"flow_id": flow_id, "flow": flow}


@app.post("/admin/ai/flow/approve")
def admin_ai_flow_approve(payload: AdminFlowApproveRequest) -> dict:
    if not ADMIN_FLOW_TOKEN or payload.token != ADMIN_FLOW_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    record = get_ai_flow(DB_PATH, payload.flow_id)
    if not record:
        raise HTTPException(status_code=404, detail="Flow not found")
    flow = record["flow"]
    try:
        validate_flow(flow, source="ai")
    except FlowValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    path = FLOWS_DIR / f"{payload.flow_id}.json"
    path.write_text(json.dumps(flow, indent=2), encoding="utf-8")
    set_course_flow(DB_PATH, record["course_id"], payload.flow_id)
    mark_ai_flow_approved(DB_PATH, payload.flow_id)
    _reload_flows()
    return {"success": True, "flow_id": payload.flow_id, "course_id": record["course_id"]}


@app.post("/admin/flows/preview")
def admin_flow_preview(
    payload: AdminFlowPreviewRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    flow = app.state.flows.get(payload.flow_id)
    if flow is None:
        record = get_ai_flow(DB_PATH, payload.flow_id)
        if record:
            flow = record["flow"]
        else:
            raise HTTPException(status_code=404, detail="Flow not found")
    steps = [
        {
            "id": step["id"],
            "type": step["type"],
            "prompt": step.get("prompt")
            or (
                f"{(step.get('prompt_text') or step.get('promptText') or '').strip()} "
                f"{(step.get('prompt_math') or step.get('promptMath') or '').strip()}"
            ).strip(),
            "prompt_text": step.get("prompt_text") or step.get("promptText"),
            "prompt_math": step.get("prompt_math") or step.get("promptMath"),
            "options": step.get("options", []),
        }
        for step in flow["steps"].values()
    ]
    return {
        "flow": {
            "id": flow["id"],
            "title": flow.get("title"),
            "statement": flow.get("statement"),
            "steps": steps,
        }
    }


@app.post("/admin/email/status")
def admin_email_status(payload: AdminEmailStatusRequest) -> dict:
    if not ADMIN_FLOW_TOKEN or payload.token != ADMIN_FLOW_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip()
    host = os.environ.get("SMTP_HOST", "").strip()
    return {
        "has_resend_key": bool(resend_key),
        "smtp_from": sender,
        "smtp_host": host,
        "use_resend": bool(resend_key),
    }


@app.post("/admin/users/bulk")
def admin_create_users(
    payload: AdminCreateUsersRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    created = []
    errors = []
    for entry in payload.users:
        username = (entry.get("username") or "").strip()
        email = (entry.get("email") or "").strip().lower()
        password = entry.get("password") or ""
        if not username or not email or not password:
            errors.append({"username": username, "email": email, "error": "Missing fields"})
            continue
        try:
            user = create_user_verified(DB_PATH, username, password, email)
            course_ids = entry.get("course_ids") or []
            if isinstance(course_ids, list) and course_ids:
                set_user_courses(DB_PATH, user["id"], course_ids)
            created.append({"username": user["username"], "email": user["email"]})
        except AuthError as exc:
            errors.append({"username": username, "email": email, "error": str(exc)})
    return {"created": created, "errors": errors}


@app.post("/admin/users/list")
def admin_list_users(
    payload: AdminUsersRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    return {"users": _with_admin_flag(list_users(DB_PATH))}


@app.post("/admin/users/delete")
def admin_delete_user(
    payload: AdminUserDeleteRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    username = (payload.username or "").strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    deleted = delete_user(DB_PATH, username)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": deleted}


@app.post("/admin/courses/students")
def admin_course_students(
    payload: AdminCourseStudentsRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    course = get_course(DB_PATH, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    students = list_course_students(DB_PATH, payload.course_id)
    return {"course": course, "students": _with_admin_flag(students)}


@app.post("/admin/courses/students/set")
def admin_course_students_set(
    payload: AdminCourseStudentsSetRequest, user: dict = Depends(get_current_user)
) -> dict:
    _require_admin_or_flow_token(payload.token, user)
    course = get_course(DB_PATH, payload.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    set_course_students(DB_PATH, payload.course_id, payload.student_ids)
    students = list_course_students(DB_PATH, payload.course_id)
    return {"course": course, "students": _with_admin_flag(students)}
