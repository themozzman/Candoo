import json

from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label

COURSE_ID = "261math-10b-2"
COURSE_LABEL = "261MATH-10B-2"
FOLDER_NAME = "F7"

F7_SA_ONLY_RUBRIC = {
    "outcome": "F7: Evaluate integrals using substitution (SA-only).",
    "requirements": [
        "All questions are short answer (SA).",
        "Question 1: identify the correct choice of u for a given integral.",
        "Question 2: identify the correct choice of du for the u from question 1.",
        "Question 3: compute a bounded integral (evaluate the bounds).",
        "Question 4: compute an unbounded (indefinite) integral (+ C required).",
        "Prompt text is English-only; all math appears in prompt_math.",
    ],
    "response_format": [
        "Use prompt_text for English instructions only (no math symbols).",
        "Use prompt_math for LaTeX expressions only.",
        "SA answers use normalized_set with multiple acceptable values.",
    ],
}

F7_SA_ONLY_INSTRUCTIONS = (
    "You are generating a learning flow JSON for a calculus quiz (F7: substitution).\n"
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
    '        "type": "SA",\n'
    '        "prompt_text": "<string>",\n'
    '        "prompt_math": "<latex or empty>",\n'
    '        "answer": { "kind": "normalized_set", "values": ["..."], "normalize": ["trim","lowercase","remove_spaces"] },\n'
    '        "feedback": { "wrongHint": "<string>", "explanation": "<string>" },\n'
    '        "solution": { "steps": [ { "text": "<string>", "math": "<string>" } ] },\n'
    '        "attemptPolicy": { "revealAfter": 2, "allowSkip": true },\n'
    '        "next": { "correct": "<step_id>", "wrong": "<step_id>", "skip": "<step_id>" }\n'
    "     }\n"
    "  }\n"
    "}\n\n"
    "REQUIRED STEPS (exactly 4, all SA):\n"
    "1) Find u.\n"
    "2) Find du.\n"
    "3) Compute bounded integral.\n"
    "4) Compute unbounded (indefinite) integral.\n\n"
    "PROMPT RULES (must follow):\n"
    "- prompt_text is English only (no math symbols).\n"
    "- All math goes in prompt_math.\n\n"
    "PROMPTS & STRUCTURE:\n"
    '1) prompt_text: "Identify the correct choice of u for the following integral."\n'
    "   prompt_math: <integral only in LaTeX>\n"
    '2) prompt_text: "Identify the correct choice of du for the following substitution."\n'
    "   prompt_math: <the u found in step 1, LaTeX only>\n"
    '3) prompt_text: "Compute the following integral."\n'
    "   prompt_math: <bounded integral only in LaTeX>\n"
    '4) prompt_text: "Compute the following integral."\n'
    "   prompt_math: <unbounded integral only in LaTeX>\n\n"
    "ANSWER RULES:\n"
    "- Step 1: provide multiple acceptable u forms in answer.values.\n"
    "- Step 2: provide multiple acceptable du forms in answer.values.\n"
    "- Step 3: final answer must be a number (evaluate bounds).\n"
    "- Step 4: final answer must include + C.\n"
)


def generate_spec(topic: str, course: dict) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(course.get("tags"))
    prompt = (
        "You are a curriculum designer for a calculus course.\n"
        f"Create a JSON teaching spec for folder {FOLDER_NAME}.\n"
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
        f"Rubric JSON:\n{json.dumps(F7_SA_ONLY_RUBRIC, indent=2)}\n\n"
        "Question types allowed: SA only.\n"
        "Follow the rubric exactly for the folder."
    )
    spec = base._json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    spec["course_tags"] = course_tags
    spec["rubric"] = F7_SA_ONLY_RUBRIC
    spec["folder_id"] = course.get("folder_id")
    spec["folder_name"] = FOLDER_NAME
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(spec.get("course_tags") or spec.get("tags"))
    is_math_course = "math" in course_tags
    prompt = (
        F7_SA_ONLY_INSTRUCTIONS
        + "\n\n"
        + f"flow_id: {flow_id}\n"
        + f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        + f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    flow = base._json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    steps = flow.get("steps")
    if isinstance(steps, dict) and steps:
        step_ids = list(steps.keys())
        last_step = steps.get(step_ids[-1])
        if isinstance(last_step, dict):
            last_step["next"] = {"correct": None, "wrong": None, "skip": None}
    base._repair_math_formatting(flow, is_math_course)
    base._validate_math_formatting(flow, is_math_course)
    return flow

