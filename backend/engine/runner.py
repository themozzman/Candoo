import os
from datetime import datetime, timezone
from .db import connect_db, set_row_factory
from uuid import uuid4

from pathlib import Path

from .analytics import get_recent_attempts, log_attempt, set_session_step, write_report_snapshot
from .quiz_generators import AIFlowError, generate_attempt_feedback
import logging

from .grading import grade_mc, grade_sa_detail

logger = logging.getLogger(__name__)

PARSE_FEEDBACK = {
    "too_long": "Your answer is too long. Try a simpler, equivalent expression.",
    "invalid_chars": "We could not parse that. Use standard math symbols like +, -, *, /, ^.",
    "too_complex": "That expression is too complex to grade. Try a simpler form.",
    "parse_error": "We could not parse that. Try standard math notation like 2*x or sqrt(x).",
}

def start_session(flow: dict, student_id: str, db_path: str) -> tuple[str, dict]:
    session_id = str(uuid4())
    start_step_id = flow["startStepId"]
    conn = connect_db(db_path)
    try:
        conn.execute(
            """
            INSERT INTO sessions (
                session_id, flow_id, student_id, current_step_id, created_at, attempts
            )
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (session_id, flow["id"], student_id, start_step_id, _now_iso()),
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
    grading_issue = None
    if not skipped:
        if step["type"] == "MC":
            correct = grade_mc(response, step["answer"]["value"])
        else:
            correct, grading_issue = grade_sa_detail(
                response,
                step["answer"]["values"],
                step["answer"].get("normalize", []),
            )

    next_step_id = _next_step_id(step, correct, skipped)
    if not correct and not skipped:
        next_step_id = step_id

    reveal = False
    correct_answer = None
    reveal_next_step = None
    if not correct and not skipped:
        reveal_after = step["attemptPolicy"]["revealAfter"]
        if attempt_number >= reveal_after:
            reveal = True
            correct_answer = _correct_answer(step)
            reveal_next_step_id = step["next"].get("correct")
            reveal_next_step = (
                flow["steps"].get(reveal_next_step_id)
                if reveal_next_step_id
                else None
            )
            next_step_id = step_id

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
    reports_dir = Path(
        os.environ.get(
            "REPORTS_PATH",
            str(Path(__file__).resolve().parents[1] / "reports"),
        )
    )
    write_report_snapshot(
        db_path=db_path,
        flow=flow,
        reports_dir=reports_dir,
    )

    if skipped:
        feedback = "Skipped."
    elif not correct and grading_issue:
        feedback = PARSE_FEEDBACK.get(grading_issue, step["feedback"]["wrongHint"])
        logger.info(
            "SA grading issue",
            extra={
                "flow_id": flow["id"],
                "step_id": step_id,
                "issue": grading_issue,
            },
        )
    else:
        feedback = step["feedback"]["explanation"] if correct else step["feedback"]["wrongHint"]

    next_step = flow["steps"].get(next_step_id) if next_step_id else None
    return {
        "correct": bool(correct),
        "skipped": bool(skipped),
        "reveal": reveal,
        "feedback": feedback,
        "correctAnswer": correct_answer if reveal else None,
        "analysisPending": bool(reveal),
        "gradingIssue": grading_issue,
        "next_step": _step_payload(next_step) if next_step else None,
        "revealNextStep": _step_payload(reveal_next_step) if reveal_next_step else None,
    }


def _step_payload(step: dict) -> dict:
    if step is None:
        return None
    payload = {
        "id": step["id"],
        "type": step["type"],
        "prompt": _prompt_string(step),
        "prompt_text": step.get("prompt_text") or step.get("promptText"),
        "prompt_math": step.get("prompt_math") or step.get("promptMath"),
        "options": step.get("options", []),
        "solution": step.get("solution"),
    }
    return payload


def advance_session(
    session_id: str,
    flow: dict,
    next_step_id: str | None,
    db_path: str,
    expected_student_id: str | None = None,
) -> None:
    session = _get_session(db_path, session_id)
    if session is None:
        raise ValueError("Session not found")
    if expected_student_id and session["student_id"] != expected_student_id:
        raise ValueError("Session not found")
    if session["flow_id"] != flow["id"]:
        raise ValueError("Session not found")
    if next_step_id is not None and next_step_id not in flow["steps"]:
        raise ValueError("Step not found in flow")
    set_session_step(db_path, session_id, next_step_id)


def analyze_attempts(
    session_id: str,
    flow: dict,
    step_id: str,
    db_path: str,
    expected_student_id: str | None = None,
) -> list[dict]:
    session = _get_session(db_path, session_id)
    if session is None:
        raise ValueError("Session not found")
    if expected_student_id and session["student_id"] != expected_student_id:
        raise ValueError("Session not found")
    if session["flow_id"] != flow["id"]:
        raise ValueError("Session not found")

    step = flow["steps"].get(step_id)
    if step is None:
        raise ValueError("Step not found in flow")

    correct_answer = _correct_answer(step)
    attempts = get_recent_attempts(db_path, session_id, step_id, limit=2)
    correction_help = []
    for attempt in attempts:
        try:
            question = _prompt_string(step)
            ai_feedback = generate_attempt_feedback(
                question=question,
                correct_answer=correct_answer or "",
                attempt=attempt["response"],
                attempt_number=attempt["attempt_number"],
            )
        except AIFlowError:
            ai_feedback = {
                "steps": [],
                "why_wrong": "We couldn't generate a detailed explanation right now.",
            }
        correction_help.append(
            {
                "attempt_number": attempt["attempt_number"],
                "response": attempt["response"],
                "why_wrong": ai_feedback.get("why_wrong", ""),
            }
        )
    return correction_help


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


def _prompt_string(step: dict) -> str:
    prompt = step.get("prompt")
    if prompt:
        return prompt
    text = step.get("prompt_text") or step.get("promptText") or ""
    math = step.get("prompt_math") or step.get("promptMath") or ""
    if text and math:
        return f"{text} {math}"
    return text or math


def _get_session(db_path: str, session_id: str) -> dict | None:
    conn = connect_db(db_path)
    set_row_factory(conn)
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
    conn = connect_db(db_path)
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) FROM attempts
            WHERE session_id = ? AND step_id = ? AND skipped = 0
            """,
            (session_id, step_id),
        ).fetchone()
        if not row:
            return 0
        value = next(iter(row.values())) if isinstance(row, dict) else row[0]
        return int(value)
    finally:
        conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
