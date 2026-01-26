import hmac
import sqlite3
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from uuid import uuid4

import bcrypt


class AuthError(ValueError):
    pass


def hash_password(password: str) -> str:
    if not password:
        raise AuthError("Password cannot be empty")
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_user(db_path: str, username: str, password: str) -> dict:
    if not username:
        raise AuthError("Username cannot be empty")
    password_hash = hash_password(password)
    now = _now_iso()
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (username, password_hash, now),
        )
        conn.commit()
        user = conn.execute(
            "SELECT id, username, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return {"id": user[0], "username": user[1], "created_at": user[2]}
    except sqlite3.IntegrityError as exc:
        raise AuthError("Username already exists") from exc
    finally:
        conn.close()


def get_user_by_username(db_path: str, username: str) -> dict | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "username": row[1],
            "password_hash": row[2],
            "created_at": row[3],
        }
    finally:
        conn.close()


def create_session(db_path: str, user_id: int, ttl_seconds: int) -> dict:
    session_id = str(uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO auth_sessions (session_id, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, user_id, now.isoformat(), expires_at.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return {"session_id": session_id, "expires_at": expires_at.isoformat()}


def delete_session(db_path: str, session_id: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("DELETE FROM auth_sessions WHERE session_id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()


def get_user_by_session(db_path: str, session_id: str) -> dict | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT users.id, users.username, auth_sessions.expires_at
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.session_id = ?
            """,
            (session_id,),
        ).fetchone()
        if not row:
            return None
        expires_at = datetime.fromisoformat(row[2])
        if expires_at < datetime.now(timezone.utc):
            return None
        return {"id": row[0], "username": row[1]}
    finally:
        conn.close()


def sign_session(session_id: str, secret: str) -> str:
    signature = hmac.new(secret.encode("utf-8"), session_id.encode("utf-8"), sha256)
    return f"{session_id}.{signature.hexdigest()}"


def verify_signed_session(token: str, secret: str) -> str | None:
    if not token or "." not in token:
        return None
    session_id, signature = token.split(".", 1)
    expected = hmac.new(secret.encode("utf-8"), session_id.encode("utf-8"), sha256)
    if not hmac.compare_digest(signature, expected.hexdigest()):
        return None
    return session_id


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
