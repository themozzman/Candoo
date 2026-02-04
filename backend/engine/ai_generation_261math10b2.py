import json

from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label

COURSE_ID = "261math-10b-2"
COURSE_LABEL = "261MATH-10B-2"

G6_RUBRIC = {
    "outcome": "G6: Use an integral to compute the area between curves.",
    "requirements": [
        "Set up the integral(s) for area between curves.",
        "Do NOT evaluate integrals.",
        "No absolute values in the final answer.",
        "Find intersection points and split intervals if the top/bottom changes.",
        "Identify upper/lower (or right/left) curve on each interval.",
    ],
    "response_format": [
        "Final answer is a sum of definite integrals only.",
        "Integrands are in the form (upper - lower) or (right - left).",
    ],
}


def generate_spec(topic: str, course: dict) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(course.get("tags"))
    prompt = (
        "You are a curriculum designer for a calculus course.\n"
        "Create a JSON teaching spec for G6 (area between curves).\n"
        "Return ONLY valid JSON.\n\n"
        "Required JSON keys:\n"
        "- topic: string\n"
        "- course_id: string\n"
        "- learning_goals: array of strings\n"
        "- rules_to_test: array of objects {id, description, examples}\n"
        "- misconceptions: array of objects {id, description, why_common}\n"
        "- question_blueprint: array of objects {rule_id, question_type, count}\n"
        "- analytics_goals: array of strings\n"
        "- notes: string\n"
        "- rubric: object with keys {outcome, requirements, response_format}\n\n"
        f"Topic: {topic}\n"
        f"Course: {course.get('id')} - {course.get('name')} ({course.get('subtitle')})\n"
        f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        f"Rubric JSON:\n{json.dumps(G6_RUBRIC, indent=2)}\n\n"
        "Question types allowed: SA (preferred), MC (only for concept checks).\n"
        "Focus on setup-only responses for area between curves."
    )
    spec = base._json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    spec["course_tags"] = course_tags
    spec["rubric"] = G6_RUBRIC
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(spec.get("course_tags") or spec.get("tags"))
    is_math_course = "math" in course_tags
    prompt = (
        "You are generating a learning flow JSON for a calculus quiz.\n"
        "This is Outcome G6: setup integrals for area between curves.\n"
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
        '        "prompt_math": "<latex or empty>",\n'
        '        "options": [ { "value": "<string>", "text": "<string>", "math": "<latex or empty>" } ]  // MC only,\n'
        '        "answer": { "kind": "exact", "value": "<option.value>" }  // MC\n'
        '        "answer": { "kind": "normalized_set", "values": ["..."], "normalize": ["trim","lowercase","remove_spaces"] }  // SA\n'
        '        "feedback": { "wrongHint": "<string>", "explanation": "<string>" },\n'
        '        "solution": { "steps": [ { "text": "<string>", "math": "<string>" } ] },\n'
        '        "attemptPolicy": { "revealAfter": 2, "allowSkip": true },\n'
        '        "next": { "correct": "<step_id>", "wrong": "<step_id>", "skip": "<step_id>" },\n'
        '        "insights": { "skill": "<string>", "rule": "<string>", "misconception_focus": "<string>" }\n'
        "     }\n"
        "  }\n"
        "}\n\n"
        "G6 RULES:\n"
        "- Problems must be area between curves (one may be the x-axis).\n"
        "- Students must SET UP integrals only; do NOT evaluate.\n"
        "- No absolute values in final answers.\n"
        "- If the top/bottom changes, split the integral and show intervals.\n"
        "- Include intersection points and sign analysis steps.\n"
        "- Use 4-6 steps total, mostly SA.\n"
        "- Final step answer must be a sum of definite integrals only.\n\n"
        "Formatting rules:\n"
        "- prompt_text is English-only, no math.\n"
        "- prompt_math is pure LaTeX for the expressions.\n"
        "- Provide 2-4 acceptable answer strings in answer.values for SA.\n"
        "- Use \\int and standard LaTeX, no evaluation.\n\n"
        "Example answer (format only):\n"
        '  "\\\\int_{a}^{b} (f(x)-g(x)) \\\\, dx + \\\\int_{b}^{c} (g(x)-f(x)) \\\\, dx"\n\n'
        f"flow_id: {flow_id}\n"
        f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    flow = base._json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    base._repair_math_formatting(flow, is_math_course)
    base._validate_math_formatting(flow, is_math_course)
    base._shuffle_mc_options(flow)
    return flow
