import json
from pathlib import Path
from datetime import datetime, timezone

from .db import connect_db, set_row_factory


def init_db(db_path: str) -> None:
    conn = connect_db(db_path)
    auto_id = "SERIAL PRIMARY KEY" if conn.use_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                flow_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                current_step_id TEXT,
                created_at TEXT NOT NULL,
                attempts INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS attempts (
                id {auto_id},
                session_id TEXT NOT NULL,
                flow_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                step_id TEXT NOT NULL,
                response TEXT,
                correct INTEGER NOT NULL,
                skipped INTEGER NOT NULL,
                attempt_number INTEGER NOT NULL,
                time_spent_ms INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS users (
                id {auto_id},
                username TEXT NOT NULL UNIQUE,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                verified_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS password_resets (
                id {auto_id},
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS email_verifications (
                id {auto_id},
                user_id INTEGER NOT NULL,
                code_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
            ON auth_sessions(user_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash
            ON password_resets(token_hash)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_password_resets_user_id
            ON password_resets(user_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_email_verifications_code_hash
            ON email_verifications(code_hash)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id
            ON email_verifications(user_id)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_attempts_flow_step
            ON attempts(flow_id, step_id)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS courses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                subtitle TEXT NOT NULL,
                description TEXT NOT NULL,
                active_flow_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_specs (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                spec_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_flows (
                id TEXT PRIMARY KEY,
                spec_id TEXT NOT NULL,
                course_id TEXT NOT NULL,
                flow_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                approved_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_courses (
                user_id INTEGER NOT NULL,
                course_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, course_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(course_id) REFERENCES courses(id)
            )
            """
        )
        _ensure_users_email_column(conn)
        _ensure_courses(conn)
        conn.commit()
    finally:
        conn.close()


def _ensure_users_email_column(conn: "DBConnection") -> None:
    if conn.use_postgres:
        conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT")
        conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TEXT")
    else:
        columns = [row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()]
        if "email" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        if "verified_at" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN verified_at TEXT")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
        ON users(email)
        """
    )


def _ensure_courses(conn: "DBConnection") -> None:
    set_row_factory(conn)
    existing_rows = conn.execute("SELECT id FROM courses").fetchall()
    existing_ids = {row["id"] for row in existing_rows}
    now = _now_iso()
    defaults = [
        (
            "french-10a",
            "French 10A",
            "Introduction to French",
            "Begin your journey into French language and culture.",
            None,
            now,
        ),
        (
            "french-20b",
            "French 20B",
            "Intermediate French",
            "Continue developing your French language skills.",
            None,
            now,
        ),
        (
            "calc-10b",
            "Calc 10B",
            "Calculus",
            "Explore derivatives, integrals, and their applications.",
            None,
            now,
        ),
        (
            "spanish-2",
            "Spanish 2",
            "Spanish",
            "Build confidence in conversational Spanish and grammar.",
            None,
            now,
        ),
    ]
    missing = [course for course in defaults if course[0] not in existing_ids]
    if not missing:
        return
    conn.executemany(
        """
        INSERT INTO courses (
            id, name, subtitle, description, active_flow_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        missing,
    )


def list_courses(db_path: str) -> list[dict]:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        rows = conn.execute(
            """
            SELECT id, name, subtitle, description, active_flow_id
            FROM courses
            ORDER BY id
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def list_courses_for_user(db_path: str, user_id: int) -> list[dict]:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        rows = conn.execute(
            """
            SELECT c.id, c.name, c.subtitle, c.description, c.active_flow_id
            FROM courses c
            JOIN user_courses uc ON uc.course_id = c.id
            WHERE uc.user_id = ?
            ORDER BY c.id
            """,
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_course(db_path: str, course_id: str) -> dict | None:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        row = conn.execute(
            """
            SELECT id, name, subtitle, description, active_flow_id
            FROM courses
            WHERE id = ?
            """,
            (course_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def set_course_flow(db_path: str, course_id: str, flow_id: str) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            UPDATE courses
            SET active_flow_id = ?
            WHERE id = ?
            """,
            (flow_id, course_id),
        )
        conn.commit()
    finally:
        conn.close()


def save_ai_spec(db_path: str, spec_id: str, course_id: str, topic: str, spec: dict) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            INSERT INTO ai_specs (id, course_id, topic, spec_json, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (spec_id, course_id, topic, json.dumps(spec), "spec_pending", _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def get_ai_spec(db_path: str, spec_id: str) -> dict | None:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        row = conn.execute(
            """
            SELECT id, course_id, topic, spec_json, status, created_at
            FROM ai_specs
            WHERE id = ?
            """,
            (spec_id,),
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["spec"] = json.loads(data.pop("spec_json"))
        return data
    finally:
        conn.close()


def save_ai_flow(
    db_path: str, flow_id: str, spec_id: str, course_id: str, flow: dict
) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            INSERT INTO ai_flows (id, spec_id, course_id, flow_json, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (flow_id, spec_id, course_id, json.dumps(flow), "flow_pending", _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def get_ai_flow(db_path: str, flow_id: str) -> dict | None:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        row = conn.execute(
            """
            SELECT id, spec_id, course_id, flow_json, status, created_at, approved_at
            FROM ai_flows
            WHERE id = ?
            """,
            (flow_id,),
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["flow"] = json.loads(data.pop("flow_json"))
        return data
    finally:
        conn.close()


def list_approved_flows(db_path: str) -> list[dict]:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        rows = conn.execute(
            """
            SELECT id, flow_json
            FROM ai_flows
            WHERE status = ?
            ORDER BY approved_at DESC, created_at DESC
            """,
            ("flow_approved",),
        ).fetchall()
        flows = []
        for row in rows:
            flow = json.loads(row["flow_json"])
            flows.append({"id": row["id"], "flow": flow})
        return flows
    finally:
        conn.close()


def mark_ai_flow_approved(db_path: str, flow_id: str) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            UPDATE ai_flows
            SET status = ?, approved_at = ?
            WHERE id = ?
            """,
            ("flow_approved", _now_iso(), flow_id),
        )
        conn.commit()
    finally:
        conn.close()


def list_users(db_path: str) -> list[dict]:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        rows = conn.execute(
            """
            SELECT id, username, email, verified_at, created_at
            FROM users
            ORDER BY username
            """
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def list_course_students(db_path: str, course_id: str) -> list[dict]:
    conn = connect_db(db_path)
    set_row_factory(conn)
    try:
        rows = conn.execute(
            """
            SELECT u.id, u.username, u.email, u.verified_at
            FROM users u
            JOIN user_courses uc ON uc.user_id = u.id
            WHERE uc.course_id = ?
            ORDER BY u.username
            """,
            (course_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def user_has_course(db_path: str, user_id: int, course_id: str) -> bool:
    conn = connect_db(db_path)
    try:
        row = conn.execute(
            """
            SELECT 1
            FROM user_courses
            WHERE user_id = ? AND course_id = ?
            LIMIT 1
            """,
            (user_id, course_id),
        ).fetchone()
        return bool(row)
    finally:
        conn.close()


def set_course_students(db_path: str, course_id: str, user_ids: list[int]) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute("DELETE FROM user_courses WHERE course_id = ?", (course_id,))
        now = _now_iso()
        conn.executemany(
            """
            INSERT INTO user_courses (user_id, course_id, created_at)
            VALUES (?, ?, ?)
            """,
            [(user_id, course_id, now) for user_id in user_ids],
        )
        conn.commit()
    finally:
        conn.close()


def set_user_courses(db_path: str, user_id: int, course_ids: list[str]) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute("DELETE FROM user_courses WHERE user_id = ?", (user_id,))
        now = _now_iso()
        conn.executemany(
            """
            INSERT INTO user_courses (user_id, course_id, created_at)
            VALUES (?, ?, ?)
            """,
            [(user_id, course_id, now) for course_id in course_ids],
        )
        conn.commit()
    finally:
        conn.close()


def get_course_id_for_flow(db_path: str, flow_id: str) -> str | None:
    conn = connect_db(db_path)
    try:
        set_row_factory(conn)
        row = conn.execute(
            """
            SELECT course_id FROM ai_flows
            WHERE id = ?
            """,
            (flow_id,),
        ).fetchone()
        if row:
            return row["course_id"]
        row = conn.execute(
            """
            SELECT id FROM courses
            WHERE active_flow_id = ?
            """,
            (flow_id,),
        ).fetchone()
        return row["id"] if row else None
    finally:
        conn.close()


def reset_auth_data(db_path: str) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute("DELETE FROM email_verifications")
        conn.execute("DELETE FROM password_resets")
        conn.execute("DELETE FROM auth_sessions")
        conn.execute("DELETE FROM users")
        conn.commit()
    finally:
        conn.close()


def reset_learning_data(db_path: str) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute("DELETE FROM attempts")
        conn.execute("DELETE FROM sessions")
        conn.commit()
    finally:
        conn.close()


def reset_flow_data(db_path: str) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute("UPDATE courses SET active_flow_id = NULL")
        conn.execute("DELETE FROM ai_flows")
        conn.execute("DELETE FROM ai_specs")
        conn.commit()
    finally:
        conn.close()


def delete_user(db_path: str, username: str) -> dict | None:
    conn = connect_db(db_path)
    try:
        set_row_factory(conn)
        user_row = conn.execute(
            "SELECT id, username FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if not user_row:
            return None
        user_id = user_row["id"]
        username_value = user_row["username"]
        if conn.use_postgres:
            tables = {
                row["table_name"]
                for row in conn.execute(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
                ).fetchall()
            }
        else:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }

        deleted = {"user_id": user_id, "username": username_value}

        if "auth_sessions" in tables:
            deleted["auth_sessions"] = conn.execute(
                "DELETE FROM auth_sessions WHERE user_id = ?",
                (user_id,),
            ).rowcount
        if "user_courses" in tables:
            deleted["user_courses"] = conn.execute(
                "DELETE FROM user_courses WHERE user_id = ?",
                (user_id,),
            ).rowcount
        if "password_resets" in tables:
            deleted["password_resets"] = conn.execute(
                "DELETE FROM password_resets WHERE user_id = ?",
                (user_id,),
            ).rowcount
        if "email_verifications" in tables:
            deleted["email_verifications"] = conn.execute(
                "DELETE FROM email_verifications WHERE user_id = ?",
                (user_id,),
            ).rowcount
        if "attempts" in tables:
            deleted["attempts"] = conn.execute(
                "DELETE FROM attempts WHERE student_id = ?",
                (username_value,),
            ).rowcount
        if "sessions" in tables:
            deleted["sessions"] = conn.execute(
                "DELETE FROM sessions WHERE student_id = ?",
                (username_value,),
            ).rowcount

        deleted["users"] = conn.execute(
            "DELETE FROM users WHERE id = ?",
            (user_id,),
        ).rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


def log_attempt(
    db_path: str,
    session_id: str,
    flow_id: str,
    student_id: str,
    step_id: str,
    response: str,
    correct: bool,
    skipped: bool,
    attempt_number: int,
    time_spent_ms: int,
    next_step_id: str | None,
) -> None:
    now = _now_iso()
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            INSERT INTO attempts (
                session_id, flow_id, student_id, step_id, response,
                correct, skipped, attempt_number, time_spent_ms, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                flow_id,
                student_id,
                step_id,
                response,
                1 if correct else 0,
                1 if skipped else 0,
                attempt_number,
                time_spent_ms,
                now,
            ),
        )
        conn.execute(
            """
            UPDATE sessions
            SET current_step_id = ?, attempts = attempts + 1
            WHERE session_id = ?
            """,
            (next_step_id, session_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_session_step(db_path: str, session_id: str, next_step_id: str | None) -> None:
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            UPDATE sessions
            SET current_step_id = ?
            WHERE session_id = ?
            """,
            (next_step_id, session_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_recent_attempts(
    db_path: str,
    session_id: str,
    step_id: str,
    limit: int = 2,
) -> list[dict]:
    conn = connect_db(db_path)
    try:
        set_row_factory(conn)
        rows = conn.execute(
            """
            SELECT attempt_number, response
            FROM attempts
            WHERE session_id = ? AND step_id = ? AND skipped = 0
              AND response IS NOT NULL AND response != ''
            ORDER BY attempt_number DESC
            LIMIT ?
            """,
            (session_id, step_id, limit),
        ).fetchall()
    finally:
        conn.close()
    attempts = [
        {"attempt_number": row["attempt_number"], "response": row["response"]}
        for row in reversed(rows)
    ]
    return attempts


def write_report_snapshot(db_path: str, flow: dict, reports_dir: Path) -> None:
    steps = [flow["steps"][step_id] for step_id in flow["steps"].keys()]
    report = get_teacher_report(db_path, flow["id"], steps)
    reports_dir.mkdir(parents=True, exist_ok=True)
    slug = _slugify(flow.get("statement") or flow.get("title") or flow.get("id"))
    filename = f"{slug}.json" if slug else f"{flow['id']}.json"
    path = reports_dir / filename
    with path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    student_filename = f"Student_{filename}"
    student_path = reports_dir / student_filename
    with student_path.open("w", encoding="utf-8") as handle:
        json.dump({"flow_id": flow["id"], "students": report.get("students", [])}, handle, indent=2)


def get_teacher_report(db_path: str, flow_id: str, steps: list[dict]) -> dict:
    conn = connect_db(db_path)
    try:
        set_row_factory(conn)
        summary = []
        wrong_samples = {}
        funnel = []
        insight_by_skill = {}
        misconception_counts = {}
        step_insights = {}
        total_steps = len(steps)

        for step in steps:
            step_id = step["id"]
            attempts = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND step_id = ?
                """,
                (flow_id, step_id),
            )
            wrong = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND step_id = ? AND correct = 0 AND skipped = 0
                """,
                (flow_id, step_id),
            )
            skipped = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND step_id = ? AND skipped = 1
                """,
                (flow_id, step_id),
            )
            correct = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND step_id = ? AND correct = 1
                """,
                (flow_id, step_id),
            )
            reached = _scalar(
                conn,
                """
                SELECT COUNT(DISTINCT student_id) FROM attempts
                WHERE flow_id = ? AND step_id = ?
                """,
                (flow_id, step_id),
            )
            correct_students = _scalar(
                conn,
                """
                SELECT COUNT(DISTINCT student_id) FROM attempts
                WHERE flow_id = ? AND step_id = ? AND correct = 1
                """,
                (flow_id, step_id),
            )
            avg_attempts_before_correct = _scalar_float(
                conn,
                """
                SELECT AVG(min_attempts) FROM (
                    SELECT session_id, MIN(attempt_number) AS min_attempts
                    FROM attempts
                    WHERE flow_id = ? AND step_id = ? AND correct = 1
                    GROUP BY session_id
                )
                """,
                (flow_id, step_id),
            )
            wrong_rows = conn.execute(
                """
                SELECT response, COUNT(*) as cnt FROM attempts
                WHERE flow_id = ? AND step_id = ? AND correct = 0 AND skipped = 0
                  AND response IS NOT NULL AND response != ''
                GROUP BY response
                ORDER BY cnt DESC
                LIMIT 5
                """,
                (flow_id, step_id),
            ).fetchall()
            common_wrong = [
                {"response": row["response"], "count": row["cnt"]} for row in wrong_rows
            ]
            wrong_samples[step_id] = common_wrong

            insights = step.get("insights", {}) if isinstance(step.get("insights"), dict) else {}
            step_insights[step_id] = insights
            skill_key = insights.get("skill") or insights.get("rule")
            if skill_key:
                current = insight_by_skill.get(
                    skill_key,
                    {"attempts": 0, "correct": 0, "wrong": 0, "skipped": 0},
                )
                current["attempts"] += attempts
                current["correct"] += correct
                current["wrong"] += wrong
                current["skipped"] += skipped
                insight_by_skill[skill_key] = current

            option_insights = step.get("option_insights") or {}
            if isinstance(option_insights, dict):
                for response, count in common_wrong:
                    tag = option_insights.get(response, {})
                    if isinstance(tag, dict):
                        mis = tag.get("misconception") or tag.get("id")
                        if mis:
                            misconception_counts[mis] = misconception_counts.get(mis, 0) + count

            common_wrong_tags = step.get("common_wrong") or []
            if isinstance(common_wrong_tags, list):
                for entry in common_wrong_tags:
                    if not isinstance(entry, dict):
                        continue
                    response = entry.get("response")
                    mis = entry.get("misconception") or entry.get("id")
                    if not response or not mis:
                        continue
                    count = next(
                        (row["cnt"] for row in wrong_rows if row["response"] == response),
                        0,
                    )
                    if count:
                        misconception_counts[mis] = misconception_counts.get(mis, 0) + count

            wrong_rate = (wrong / attempts) if attempts else 0.0
            skip_rate = (skipped / attempts) if attempts else 0.0

            summary.append(
                {
                    "step_id": step_id,
                    "prompt": step.get("prompt", ""),
                    "prompt_text": step.get("prompt_text") or step.get("promptText"),
                    "prompt_math": step.get("prompt_math") or step.get("promptMath"),
                    "attempts": attempts,
                    "correct_count": correct,
                    "wrong_count": wrong,
                    "skip_count": skipped,
                    "wrong_rate": round(wrong_rate, 4),
                    "skip_rate": round(skip_rate, 4),
                    "avg_attempts_before_correct": avg_attempts_before_correct,
                }
            )

            funnel.append(
                {
                    "step_id": step_id,
                    "prompt": step.get("prompt", ""),
                    "prompt_text": step.get("prompt_text") or step.get("promptText"),
                    "prompt_math": step.get("prompt_math") or step.get("promptMath"),
                    "students_reached": reached,
                    "students_correct": correct_students,
                }
            )

        bottlenecks = sorted(
            summary,
            key=lambda item: (item["wrong_rate"], item["skip_rate"], item["attempts"]),
            reverse=True,
        )

        students = _build_student_report(conn, flow_id, steps, total_steps)

        return {
            "flow_id": flow_id,
            "summary_by_step": summary,
            "bottlenecks": bottlenecks[:5],
            "funnel": funnel,
            "wrong_response_samples": wrong_samples,
            "step_insights": step_insights,
            "insight_summary": {
                "by_skill": insight_by_skill,
                "misconceptions": misconception_counts,
            },
            "students": students,
        }
    finally:
        conn.close()


def _scalar(conn: "DBConnection", query: str, params: tuple) -> int:
    row = conn.execute(query, params).fetchone()
    if not row:
        return 0
    value = next(iter(row.values())) if isinstance(row, dict) else row[0]
    return int(value) if value is not None else 0


def _scalar_float(conn: "DBConnection", query: str, params: tuple) -> float | None:
    row = conn.execute(query, params).fetchone()
    if not row:
        return None
    value = next(iter(row.values())) if isinstance(row, dict) else row[0]
    return float(value) if value is not None else None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_student_report(
    conn: "DBConnection", flow_id: str, steps: list[dict], total_steps: int
) -> list[dict]:
    students = [
        row["student_id"]
        for row in conn.execute(
            """
            SELECT DISTINCT student_id FROM attempts
            WHERE flow_id = ?
            ORDER BY student_id
            """,
            (flow_id,),
        ).fetchall()
    ]
    step_ids = [step["id"] for step in steps]
    report = []

    for student_id in students:
        attempts = _scalar(
            conn,
            """
            SELECT COUNT(*) FROM attempts
            WHERE flow_id = ? AND student_id = ?
            """,
            (flow_id, student_id),
        )
        wrong = _scalar(
            conn,
            """
            SELECT COUNT(*) FROM attempts
            WHERE flow_id = ? AND student_id = ? AND correct = 0 AND skipped = 0
            """,
            (flow_id, student_id),
        )
        skipped = _scalar(
            conn,
            """
            SELECT COUNT(*) FROM attempts
            WHERE flow_id = ? AND student_id = ? AND skipped = 1
            """,
            (flow_id, student_id),
        )
        correct = _scalar(
            conn,
            """
            SELECT COUNT(*) FROM attempts
            WHERE flow_id = ? AND student_id = ? AND correct = 1
            """,
            (flow_id, student_id),
        )
        steps_reached = _scalar(
            conn,
            """
            SELECT COUNT(DISTINCT step_id) FROM attempts
            WHERE flow_id = ? AND student_id = ?
            """,
            (flow_id, student_id),
        )
        steps_correct = _scalar(
            conn,
            """
            SELECT COUNT(DISTINCT step_id) FROM attempts
            WHERE flow_id = ? AND student_id = ? AND correct = 1
            """,
            (flow_id, student_id),
        )
        avg_attempts_per_step = (
            (attempts / steps_reached) if steps_reached else None
        )
        completion_rate = (
            (steps_correct / total_steps) if total_steps else 0.0
        )
        wrong_rate = (wrong / attempts) if attempts else 0.0
        skip_rate = (skipped / attempts) if attempts else 0.0

        last_attempt = conn.execute(
            """
            SELECT MAX(created_at) FROM attempts
            WHERE flow_id = ? AND student_id = ?
            """,
            (flow_id, student_id),
        ).fetchone()
        if last_attempt:
            last_attempt_at = (
                next(iter(last_attempt.values()))
                if isinstance(last_attempt, dict)
                else last_attempt[0]
            )
        else:
            last_attempt_at = None

        misconceptions = {}
        for step_id in step_ids:
            rows = conn.execute(
                """
                SELECT response, COUNT(*) as cnt FROM attempts
                WHERE flow_id = ? AND student_id = ? AND step_id = ?
                  AND correct = 0 AND skipped = 0
                  AND response IS NOT NULL AND response != ''
                GROUP BY response
                ORDER BY cnt DESC
                LIMIT 3
                """,
                (flow_id, student_id, step_id),
            ).fetchall()
            if rows:
                misconceptions[step_id] = [
                    {"response": row["response"], "count": row["cnt"]} for row in rows
                ]

        troublesome = None
        for step_id in step_ids:
            step_wrong = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND student_id = ? AND step_id = ?
                  AND correct = 0 AND skipped = 0
                """,
                (flow_id, student_id, step_id),
            )
            step_attempts = _scalar(
                conn,
                """
                SELECT COUNT(*) FROM attempts
                WHERE flow_id = ? AND student_id = ? AND step_id = ?
                """,
                (flow_id, student_id, step_id),
            )
            if step_attempts == 0:
                continue
            candidate = {
                "step_id": step_id,
                "wrong_count": step_wrong,
                "attempts": step_attempts,
            }
            if troublesome is None:
                troublesome = candidate
            else:
                if (
                    candidate["wrong_count"] > troublesome["wrong_count"]
                    or (
                        candidate["wrong_count"] == troublesome["wrong_count"]
                        and candidate["attempts"] > troublesome["attempts"]
                    )
                ):
                    troublesome = candidate

        at_risk = (
            wrong_rate >= 0.4
            or skip_rate >= 0.25
            or completion_rate < 0.6
        )

        report.append(
            {
                "student_id": student_id,
                "attempts": attempts,
                "correct_count": correct,
                "wrong_count": wrong,
                "skip_count": skipped,
                "steps_reached": steps_reached,
                "steps_correct": steps_correct,
                "avg_attempts_per_step": round(avg_attempts_per_step, 2)
                if avg_attempts_per_step is not None
                else None,
                "completion_rate": round(completion_rate, 4),
                "wrong_rate": round(wrong_rate, 4),
                "skip_rate": round(skip_rate, 4),
                "last_attempt_at": last_attempt_at,
                "most_troublesome_step": troublesome,
                "misconceptions": misconceptions,
                "at_risk": at_risk,
            }
        )

    return report


def _slugify(value: str) -> str:
    result = []
    for char in value.lower():
        if char.isalnum():
            result.append(char)
        elif char in {" ", "-", "_"}:
            result.append("_")
    slug = "".join(result).strip("_")
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug[:80]
