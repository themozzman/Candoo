import json
import os
import time
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.analytics import (
    get_ai_flow,
    get_ai_spec,
    get_course,
    get_teacher_report,
    init_db,
    list_courses,
    mark_ai_flow_approved,
    reset_auth_data,
    reset_learning_data,
    save_ai_flow,
    save_ai_spec,
    set_course_flow,
)
from engine.ai_generation import AIFlowError, generate_flow, generate_spec, now_label
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
from engine.runner import start_session, submit_answer


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
_flows_env = os.environ.get("FLOWS_PATH", "").strip()
if _flows_env:
    FLOWS_DIR = Path(_flows_env)
else:
    primary_flows = ROOT_DIR / "shared" / "flows"
    fallback_flows = BASE_DIR / "shared" / "flows"
    FLOWS_DIR = primary_flows if primary_flows.exists() else fallback_flows
DB_PATH = os.environ.get("DATABASE_PATH", str(ROOT_DIR / "backend" / "storage" / "app.db"))
REPORTS_PATH = os.environ.get("REPORTS_PATH", str(ROOT_DIR / "backend" / "reports"))
AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "86400"))
RESET_TOKEN_TTL_SECONDS = int(os.environ.get("RESET_TOKEN_TTL_SECONDS", "3600"))
VERIFY_CODE_TTL_SECONDS = int(os.environ.get("VERIFY_CODE_TTL_SECONDS", "600"))
RESET_LINK_BASE = os.environ.get("RESET_LINK_BASE", "http://localhost:5173")
ADMIN_RESET_TOKEN = os.environ.get("ADMIN_RESET_TOKEN", "")
ADMIN_FLOW_TOKEN = os.environ.get("ADMIN_FLOW_TOKEN", "")
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


class AdminEmailStatusRequest(BaseModel):
    token: str


class AdminCreateUsersRequest(BaseModel):
    token: str
    users: list[dict]


@app.on_event("startup")
def startup() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORTS_PATH).mkdir(parents=True, exist_ok=True)
    init_db(DB_PATH)
    try:
        flows = load_flows(FLOWS_DIR)
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
    flows = load_flows(FLOWS_DIR)
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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/flows")
def list_flows() -> list[dict]:
    flows = app.state.flows
    return [
        {"id": flow["id"], "title": flow["title"], "topic": flow["topic"]}
        for flow in flows.values()
    ]


@app.get("/courses")
def list_courses_endpoint() -> list[dict]:
    return list_courses(DB_PATH)


@app.post("/session/start")
def session_start(payload: StartSessionRequest, user: dict = Depends(get_current_user)) -> dict:
    flows = app.state.flows
    flow = flows.get(payload.flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    session_id, step = start_session(flow, user["username"], DB_PATH)
    return {
        "session_id": session_id,
        "flow": {
            "id": flow["id"],
            "title": flow["title"],
            "statement": flow["statement"],
        },
        "step": step,
    }


@app.post("/session/{session_id}/submit")
def submit(
    session_id: str,
    payload: SubmitRequest,
    user: dict = Depends(get_current_user),
) -> dict:
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
    return {"username": user["username"], "email": user.get("email")}


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
    return {"username": user["username"], "email": user.get("email")}


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
def admin_create_users(payload: AdminCreateUsersRequest) -> dict:
    if not ADMIN_FLOW_TOKEN or payload.token != ADMIN_FLOW_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
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
            created.append({"username": user["username"], "email": user["email"]})
        except AuthError as exc:
            errors.append({"username": username, "email": email, "error": str(exc)})
    return {"created": created, "errors": errors}
