import json

from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label


COURSE_ID = "261fren-20b-1"
COURSE_LABEL = "261FREN-20B-1"


def generate_spec(topic: str, course: dict) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(course.get("tags"))
    difficulty = course.get("difficulty") or "medium"
    admin_prompt = (course.get("admin_prompt") or "").strip()
    learning_goals = course.get("learning_goals") or []
    if not isinstance(learning_goals, list):
        learning_goals = []
    prompt = (
        "You are a curriculum designer for a French course.\n"
        "Create a JSON teaching spec for the topic.\n"
        "Return ONLY valid JSON.\n\n"
        "Required JSON keys:\n"
        "- topic: string\n"
        "- course_id: string\n"
        "- learning_goals: array of strings\n"
        "- rules_to_test: array of objects {id, description, examples}\n"
        "- misconceptions: array of objects {id, description, why_common}\n"
        "- question_blueprint: array of objects {rule_id, question_type, count}\n"
        "- analytics_goals: array of strings\n"
        "- notes: string\n\n"
        f"Topic: {topic}\n"
        f"Course: {course.get('id')} - {course.get('name')} ({course.get('subtitle')})\n"
        f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        f"Difficulty: {difficulty}\n"
        f"Learning goals: {json.dumps(learning_goals, ensure_ascii=True)}\n"
        f"{'Admin instructions: ' + admin_prompt if admin_prompt else ''}\n"
        "Question types allowed: MC, SA.\n"
        "All questions are language-focused (no math content)."
    )
    spec = base._json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    spec["course_tags"] = course_tags
    spec["difficulty"] = difficulty
    if admin_prompt:
        spec["admin_prompt"] = admin_prompt
    if learning_goals:
        spec["learning_goals"] = learning_goals
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = base._client()
    difficulty = spec.get("difficulty") or "medium"
    admin_prompt = (spec.get("admin_prompt") or "").strip()
    learning_goals = spec.get("learning_goals") or []
    if not isinstance(learning_goals, list):
        learning_goals = []
    if not learning_goals:
        raise AIFlowError("French generator requires at least one learning goal.")
    expected_steps = len(learning_goals) * 3
    prompt = (
        "You are generating a learning flow JSON for a French quiz.\n"
        "Return ONLY valid JSON that follows this schema:\n"
        "{\n"
        '  "schemaVersion": 1,\n'
        '  "id": "<flow_id>",\n'
        '  "title": "<string>",\n'
        '  "topic": "<string>",\n'
        '  "statement": "<string>",\n'
        '  "startStepId": "<step_id>",\n'
        '  "steps": {\n'
        '     "<step_id>": {\n'
        '        "id": "<step_id>",\n'
        '        "type": "MC" | "SA",\n'
        '        "prompt_text": "<string>",\n'
        '        "prompt_math": "",\n'
        '        "options": [ { "value": "<string>", "text": "<string>", "math": "" } ]  // MC only,\n'
        '        "answer": { "kind": "exact", "value": "<option.value>" }  // MC\n'
        '        "answer": { "kind": "normalized_set", "values": ["..."], "normalize": ["trim","lowercase"] }  // SA\n'
        '        "feedback": { "wrongHint": "<string>", "explanation": "<string>" },\n'
        '        "solution": { "steps": [ { "text": "<string>", "math": "" } ] },\n'
        '        "attemptPolicy": { "revealAfter": 2, "allowSkip": true },\n'
        '        "next": { "correct": "<step_id>", "wrong": "<step_id>", "skip": "<step_id>" },\n'
        '        "insights": { "skill": "<string>", "rule": "<string>", "misconception_focus": "<string>" }\n'
        "     }\n"
        "  }\n"
        "}\n\n"
        "Rules:\n"
        "- Use exactly 3 questions per learning goal.\n"
        "- Each learning goal must be covered with three distinct question types.\n"
        "- Mix MC and SA questions (at least one MC and one SA per goal).\n"
        "- Avoid repeating the same stem structure across goals.\n"
        f"- Output exactly {expected_steps} steps total.\n"
        "- Use prompt_text for the instruction and content; prompt_math must be empty.\n"
        "- MC options must be full English/French phrases, not single letters.\n"
        "- For SA, accept 2-4 equivalent answers (case/whitespace variations).\n"
        "- The final step must terminate the flow by setting next.correct/next.wrong/next.skip to null.\n"
        "- All content must be language-focused (no math, formulas, or symbols).\n\n"
        f"Difficulty: {difficulty}\n"
        f"Learning goals: {json.dumps(learning_goals, ensure_ascii=True)}\n"
        f"{'Admin instructions: ' + admin_prompt if admin_prompt else ''}\n"
        f"flow_id: {flow_id}\n"
        f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    for attempt in range(3):
        flow = base._json_response(client, prompt)
        if not isinstance(flow, dict):
            raise AIFlowError("Flow response must be a JSON object")
        flow["schemaVersion"] = 1
        flow["id"] = flow_id
        _repair_null_next(flow)
        _ensure_terminal_step(flow)
        try:
            _validate_learning_goal_counts(flow, learning_goals)
        except AIFlowError:
            if attempt < 2:
                prompt = (
                    prompt
                    + "\n\n"
                    + f"Validation failed: expected exactly {expected_steps} steps. "
                    "Return the full flow again with the correct count."
                )
                continue
            raise
        base._shuffle_mc_options(flow)
        return flow
    raise AIFlowError("French flow generation failed.")


def _validate_learning_goal_counts(flow: dict, learning_goals: list[str]) -> None:
    steps = flow.get("steps")
    if not isinstance(steps, dict) or not steps:
        raise AIFlowError("French flow steps must be an object")
    expected = len(learning_goals) * 3
    if len(steps) != expected:
        raise AIFlowError(
            f"French flow must include {expected} steps (3 per learning goal)."
        )


def _repair_null_next(flow: dict) -> None:
    steps = flow.get("steps")
    if not isinstance(steps, dict):
        return
    for step in steps.values():
        if not isinstance(step, dict):
            continue
        next_branch = step.get("next")
        if not isinstance(next_branch, dict):
            continue
        for key in ("correct", "wrong", "skip"):
            target = next_branch.get(key)
            if isinstance(target, str) and target.strip().lower() in {"null", "none"}:
                next_branch[key] = None


def _ensure_terminal_step(flow: dict) -> None:
    steps = flow.get("steps")
    if not isinstance(steps, dict) or not steps:
        return
    for step in steps.values():
        next_branch = step.get("next")
        if isinstance(next_branch, dict) and all(
            next_branch.get(key) is None for key in ("correct", "wrong", "skip")
        ):
            return
    step_ids = list(steps.keys())
    last_step = steps.get(step_ids[-1])
    if isinstance(last_step, dict):
        last_step["next"] = {"correct": None, "wrong": None, "skip": None}
