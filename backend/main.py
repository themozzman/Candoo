import os
import time
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.analytics import get_teacher_report, init_db
from engine.auth import (
    AuthError,
    create_session,
    create_user,
    delete_session,
    get_user_by_session,
    get_user_by_username,
    sign_session,
    verify_password,
    verify_signed_session,
)
from engine.loader import FlowValidationError, load_flows
from engine.runner import start_session, submit_answer


BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
FLOWS_DIR = ROOT_DIR / "shared" / "flows"
DB_PATH = os.environ.get("DATABASE_PATH", str(ROOT_DIR / "backend" / "storage" / "app.db"))
REPORTS_PATH = os.environ.get("REPORTS_PATH", str(ROOT_DIR / "backend" / "reports"))
AUTH_SECRET = os.environ.get("AUTH_SECRET", "dev-secret")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "86400"))
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


class AuthRequest(BaseModel):
    username: str
    password: str


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
        samesite="lax",
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
def auth_signup(payload: AuthRequest, response: Response, request: Request) -> dict:
    _rate_limit(request, "signup")
    try:
        user = create_user(DB_PATH, payload.username, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session = create_session(DB_PATH, user["id"], SESSION_TTL_SECONDS)
    token = sign_session(session["session_id"], AUTH_SECRET)
    _set_session_cookie(response, token)
    return {"username": user["username"]}


@app.post("/auth/login")
def auth_login(payload: AuthRequest, response: Response, request: Request) -> dict:
    _rate_limit(request, "login")
    user = get_user_by_username(DB_PATH, payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    session = create_session(DB_PATH, user["id"], SESSION_TTL_SECONDS)
    token = sign_session(session["session_id"], AUTH_SECRET)
    _set_session_cookie(response, token)
    return {"username": user["username"]}


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
    return {"username": user["username"]}
