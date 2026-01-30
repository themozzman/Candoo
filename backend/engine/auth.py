import hmac
import json
import os
import secrets
import sqlite3
import smtplib
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
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


def create_user(db_path: str, username: str, password: str, email: str) -> dict:
    return _create_user(db_path, username, password, email, verified_at=None)


def create_user_verified(db_path: str, username: str, password: str, email: str) -> dict:
    return _create_user(db_path, username, password, email, verified_at=_now_iso())


def _create_user(
    db_path: str, username: str, password: str, email: str, verified_at: str | None
) -> dict:
    if not username:
        raise AuthError("Username cannot be empty")
    if not email:
        raise AuthError("Email cannot be empty")
    if "@" not in email:
        raise AuthError("Email must be valid")
    password_hash = hash_password(password)
    now = _now_iso()
    conn = sqlite3.connect(db_path)
    try:
        try:
            conn.execute(
                """
                INSERT INTO users (username, email, password_hash, created_at, verified_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, email, password_hash, now, verified_at),
            )
        except sqlite3.OperationalError as exc:
            if "no such column: email" in str(exc):
                _ensure_users_email_column(conn)
                conn.execute(
                    """
                    INSERT INTO users (username, email, password_hash, created_at, verified_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (username, email, password_hash, now, verified_at),
                )
            else:
                raise
        conn.commit()
        user = conn.execute(
            "SELECT id, username, email, created_at, verified_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        return {
            "id": user[0],
            "username": user[1],
            "email": user[2],
            "created_at": user[3],
            "verified_at": user[4],
        }
    except sqlite3.IntegrityError as exc:
        raise AuthError("Username or email already exists") from exc
    finally:
        conn.close()


def _ensure_users_email_column(conn: sqlite3.Connection) -> None:
    columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "email" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if "verified_at" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN verified_at TEXT")


def get_user_by_username(db_path: str, username: str) -> dict | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT id, username, email, password_hash, created_at, verified_at
            FROM users WHERE username = ?
            """,
            (username,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "username": row[1],
            "email": row[2],
            "password_hash": row[3],
            "created_at": row[4],
            "verified_at": row[5],
        }
    finally:
        conn.close()


def get_user_by_email(db_path: str, email: str) -> dict | None:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT id, username, email, password_hash, created_at, verified_at
            FROM users WHERE email = ?
            """,
            (email,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0],
            "username": row[1],
            "email": row[2],
            "password_hash": row[3],
            "created_at": row[4],
            "verified_at": row[5],
        }
    finally:
        conn.close()


def create_password_reset(db_path: str, user_id: int, ttl_seconds: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO password_resets (user_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, token_hash, now.isoformat(), expires_at.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def verify_password_reset(db_path: str, token: str) -> dict | None:
    if not token:
        return None
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT id, user_id, expires_at, used_at
            FROM password_resets
            WHERE token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if not row:
            return None
        expires_at = datetime.fromisoformat(row[2])
        if row[3] is not None:
            return None
        if expires_at < datetime.now(timezone.utc):
            return None
        return {"id": row[0], "user_id": row[1]}
    finally:
        conn.close()


def mark_password_reset_used(db_path: str, reset_id: int) -> None:
    now = _now_iso()
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE password_resets SET used_at = ? WHERE id = ?",
            (now, reset_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_user_password(db_path: str, user_id: int, password: str) -> None:
    password_hash = hash_password(password)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def create_email_verification(db_path: str, user_id: int, ttl_seconds: int) -> str:
    code = "".join(str(secrets.randbelow(10)) for _ in range(6))
    code_hash = sha256(code.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO email_verifications (user_id, code_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, code_hash, now.isoformat(), expires_at.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()
    return code


def verify_email_code(db_path: str, user_id: int, code: str) -> bool:
    if not code:
        return False
    code_hash = sha256(code.encode("utf-8")).hexdigest()
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT id, expires_at, used_at
            FROM email_verifications
            WHERE user_id = ? AND code_hash = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (user_id, code_hash),
        ).fetchone()
        if not row:
            return False
        if row[2] is not None:
            return False
        expires_at = datetime.fromisoformat(row[1])
        if expires_at < datetime.now(timezone.utc):
            return False
        conn.execute(
            "UPDATE email_verifications SET used_at = ? WHERE id = ?",
            (_now_iso(), row[0]),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def mark_user_verified(db_path: str, user_id: int) -> None:
    now = _now_iso()
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "UPDATE users SET verified_at = ? WHERE id = ?",
            (now, user_id),
        )
        conn.commit()
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
            SELECT users.id, users.username, users.email, auth_sessions.expires_at
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.session_id = ?
            """,
            (session_id,),
        ).fetchone()
        if not row:
            return None
        expires_at = datetime.fromisoformat(row[3])
        if expires_at < datetime.now(timezone.utc):
            return None
        return {"id": row[0], "username": row[1], "email": row[2]}
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


def send_password_reset_email(recipient: str, reset_link: str) -> None:
    _send_email(
        recipient,
        "Reset your password",
        "Use the link below to reset your password:\n\n"
        f"{reset_link}\n\n"
        "If you did not request this, you can ignore this email.",
    )


def send_verification_email(recipient: str, code: str) -> None:
    _send_email(
        recipient,
        "Verify your account",
        "Use the code below to verify your account:\n\n"
        f"{code}\n\n"
        "If you did not request this, you can ignore this email.",
    )


def _send_email(recipient: str, subject: str, text: str) -> None:
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")
    sender = os.environ.get("SMTP_FROM")
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
    resend_api_key = os.environ.get("RESEND_API_KEY")

    if resend_api_key:
        try:
            payload = {
                "from": sender,
                "to": [recipient],
                "subject": subject,
                "text": text,
            }
            data = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                "https://api.resend.com/emails",
                data=data,
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                response.read()
            return
        except Exception as exc:
            print(f"Resend API send failed: {exc}")

    if not host or not sender:
        print("Email not sent: SMTP settings missing.")
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(text)

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=10) as server:
                if username and password:
                    server.login(username, password)
                server.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=10) as server:
                if use_tls:
                    server.starttls()
                if username and password:
                    server.login(username, password)
                server.send_message(message)
    except Exception as exc:
        print(f"Email send failed: {exc}")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
