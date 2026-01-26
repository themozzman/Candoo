import sqlite3
from uuid import uuid4

from pathlib import Path

from .analytics import log_attempt, write_report_snapshot
from .grading import grade_mc, grade_sa


def start_session(flow: dict, student_id: str, db_path: str) -> tuple[str, dict]:
    session_id = str(uuid4())
    start_step_id = flow["startStepId"]
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO sessions (
                session_id, flow_id, student_id, current_step_id, created_at, attempts
            )
            VALUES (?, ?, ?, ?, datetime('now'), 0)
            """,
            (session_id, flow["id"], student_id, start_step_id),
        )
        conn.commit()
    finally:
        conn.close()

    step = _step_payload(flow["steps"][start_step_id])
    return session_id, step


def submit_answer(
    session_id: str,
    flow: dict,
    step_id: str,
    response: str,
    skipped: bool,
    time_spent_ms: int,
    db_path: str,
    expected_student_id: str | None = None,
) -> dict:
    session = _get_session(db_path, session_id)
    if session is None:
        raise ValueError("Session not found")
    if expected_student_id and session["student_id"] != expected_student_id:
        raise ValueError("Session not found")
    if session["flow_id"] != flow["id"]:
        raise ValueError("Session not found")
    if session["current_step_id"] is None:
        raise ValueError("Session already completed")
    if session["current_step_id"] != step_id:
        raise ValueError("Step mismatch for session")

    step = flow["steps"].get(step_id)
    if step is None:
        raise ValueError("Step not found in flow")

    if skipped and not step["attemptPolicy"]["allowSkip"]:
        raise ValueError("Skip not allowed for this step")

    attempt_number = _count_attempts(db_path, session_id, step_id) + 1
    correct = False
    if not skipped:
        if step["type"] == "MC":
            correct = grade_mc(response, step["answer"]["value"])
        else:
            correct = grade_sa(response, step["answer"]["values"], step["answer"].get("normalize", []))

    next_step_id = _next_step_id(step, correct, skipped)
    log_attempt(
        db_path=db_path,
        session_id=session_id,
        flow_id=flow["id"],
        student_id=session["student_id"],
        step_id=step_id,
        response=response,
        correct=correct,
        skipped=skipped,
        attempt_number=attempt_number,
        time_spent_ms=time_spent_ms,
        next_step_id=next_step_id,
    )
    write_report_snapshot(
        db_path=db_path,
        flow=flow,
        reports_dir=Path(__file__).resolve().parents[1] / "reports",
    )

    reveal = False
    correct_answer = None
    if not correct and not skipped:
        reveal_after = step["attemptPolicy"]["revealAfter"]
        if attempt_number >= reveal_after:
            reveal = True
            correct_answer = _correct_answer(step)

    feedback = step["feedback"]["explanation"] if correct else step["feedback"]["wrongHint"]

    next_step = flow["steps"].get(next_step_id) if next_step_id else None
    return {
        "correct": bool(correct),
        "reveal": reveal,
        "feedback": feedback,
        "correctAnswer": correct_answer if reveal else None,
        "next_step": _step_payload(next_step) if next_step else None,
    }


def _step_payload(step: dict) -> dict:
    if step is None:
        return None
    payload = {
        "id": step["id"],
        "type": step["type"],
        "prompt": step["prompt"],
        "options": step.get("options", []),
    }
    return payload


def _next_step_id(step: dict, correct: bool, skipped: bool) -> str | None:
    next_branch = step["next"]
    if skipped:
        return next_branch.get("skip")
    if correct:
        return next_branch.get("correct")
    wrong = next_branch.get("wrong")
    return wrong if wrong is not None else step["id"]


def _correct_answer(step: dict) -> str:
    if step["type"] == "MC":
        return step["answer"]["value"]
    values = step["answer"]["values"]
    return values[0] if values else ""


def _get_session(db_path: str, session_id: str) -> dict | None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            """
            SELECT session_id, flow_id, student_id, current_step_id
            FROM sessions WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _count_attempts(db_path: str, session_id: str, step_id: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) FROM attempts
            WHERE session_id = ? AND step_id = ?
            """,
            (session_id, step_id),
        ).fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()
