import json
import os
import re
from datetime import datetime, timezone

from openai import OpenAI


DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


class AIFlowError(RuntimeError):
    pass


def generate_spec(topic: str, course: dict) -> dict:
    client = _client()
    course_tags = _normalize_tags(course.get("tags"))
    prompt = (
        "You are a curriculum designer. Create a JSON teaching spec for the topic.\n"
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
        "Question types allowed: MC, SA, SPOT_ERROR.\n"
        "Make analytics goals explicit so the flow can capture insights."
    )
    spec = _json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    spec["course_tags"] = course_tags
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = _client()
    course_tags = _normalize_tags(spec.get("course_tags") or spec.get("tags"))
    is_math_course = "math" in course_tags
    prompt = (
        "You are generating a learning flow JSON for the app.\n"
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
        '        "answer": { "kind": "normalized_set", "values": ["..."], "normalize": ["trim","lowercase"] }  // SA\n'
        '        "feedback": { "wrongHint": "<string>", "explanation": "<string>" },\n'
        '        "solution": { "steps": [ { "text": "<string>", "math": "<string>" } ] },\n'
        '        "attemptPolicy": { "revealAfter": 2, "allowSkip": true },\n'
        '        "next": { "correct": "<step_id>", "wrong": "<step_id>", "skip": "<step_id>" },\n'
        '        "insights": { "skill": "<string>", "rule": "<string>", "misconception_focus": "<string>" },\n'
        '        "option_insights": { "<option>": { "misconception": "<string>" } } // MC optional,\n'
        '        "common_wrong": [ { "response": "<string>", "misconception": "<string>" } ] // SA optional\n'
        "     }\n"
        "  }\n"
        "}\n\n"
        "Rules:\n"
        "- Use 6-10 steps total.\n"
        "- Ensure the flow teaches the topic and captures insights aligned to the spec.\n"
        "- Each step must include an insights object.\n"
        "- MC options must be full, meaningful answers (no single-letter placeholders like A/B/C/D).\n"
        "- Use prompt_text for the instruction only (no math tokens, no equations).\n"
        "- Use prompt_math for the math expression only (LaTeX), or empty if no math.\n"
        "- The UI will show prompt_text first and prompt_math underneath.\n"
        "- For MC options, choose exactly one of these formats:\n"
        "  1) All math options: text empty, math contains the full option in LaTeX.\n"
        "  2) Mixed English + math: text contains the English clause, math contains the LaTeX expression.\n"
        "     The UI will show text first and the math underneath for that option.\n"
        "  3) All English options: text contains the full option, math is empty.\n"
        "- MC option objects must include a stable value field used by the answer.\n"
        "- If the course is non-math, prompt_math should be empty and options should be English-only.\n"
        "- Self-check before output: ensure prompt_text has no math tokens and prompt_math has no English words.\n"
        "- If any rule is violated, fix the JSON before returning it.\n"
        "Examples (GOOD):\n"
        '  prompt_text: "Evaluate the integral using limits."\n'
        '  prompt_math: "\\\\int_{1}^{\\\\infty} \\\\frac{1}{x^2} \\\\; dx"\n'
        '  options: [\n'
        '    {"value":"opt1","text":"","math":"2x\\\\sin(x)+x^2\\\\cos(x)"},\n'
        '    {"value":"opt2","text":"Converges because","math":"\\\\int_1^\\\\infty \\\\frac{1}{x^2} dx"},\n'
        '    {"value":"opt3","text":"It diverges.","math":""}\n'
        "  ]\n"
        "Example (BAD):\n"
        '  prompt_text: "Evaluate \\\\int_1^\\\\infty 1/x^2 dx"\n'
        '  prompt_math: ""\n'
        "- The final step must terminate the flow by setting next.correct/next.wrong/next.skip to null.\n"
        "- Use realistic answer options and feedback.\n"
        "- For SA steps, include solution.steps with 2-5 concise items.\n"
        "- Each solution step should have a short text and a math expression.\n"
        "- The math expression should show the algebraic transformation or intermediate form.\n"
        "- Use the provided flow_id.\n\n"
        f"flow_id: {flow_id}\n"
        f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    flow = _json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    _validate_math_formatting(flow, is_math_course)
    return flow


def _normalize_tags(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(tag).strip().lower() for tag in value if str(tag).strip()]
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(tag).strip().lower() for tag in parsed if str(tag).strip()]
        except json.JSONDecodeError:
            pass
        return [tag.strip().lower() for tag in raw.split(",") if tag.strip()]
    return []


def generate_attempt_feedback(
    question: str,
    correct_answer: str,
    attempt: str,
    attempt_number: int,
) -> dict:
    client = _client()
    prompt = (
        "You are a helpful math tutor. Return ONLY valid JSON.\n\n"
        "Input:\n"
        f"Question: {question}\n"
        f"Correct answer: {correct_answer}\n"
        f"Student attempt (Attempt {attempt_number}): {attempt}\n\n"
        "Tasks:\n"
        "1) Explain specifically why the student's attempt is wrong.\n"
        "Start the response with: \"Your answer is incorrect\".\n\n"
        "Return JSON with keys:\n"
        '- why_wrong: string\n'
    )
    data = _json_response(client, prompt)
    if not isinstance(data, dict):
        raise AIFlowError("Attempt feedback response must be a JSON object")
    why_wrong = data.get("why_wrong")
    if not isinstance(why_wrong, str):
        why_wrong = ""
    return {"why_wrong": why_wrong}


def _client() -> OpenAI:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise AIFlowError("OPENAI_API_KEY is not configured")
    return OpenAI(api_key=key)


def _json_response(client: OpenAI, prompt: str) -> dict:
    response = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": "You return JSON only."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    content = response.choices[0].message.content or "{}"
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise AIFlowError(f"Failed to parse AI JSON: {exc}") from exc




def now_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


_MATH_TOKEN_RE = re.compile(
    r"[=^_]|\\|∫|∞|π|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root)\b|[a-zA-Z]\s*\^|[a-zA-Z]\s*\(",
    flags=re.IGNORECASE,
)
_ENGLISH_IN_MATH_RE = re.compile(
    r"\b(from|to|the|using|integral|evaluate|which|statement|converges|diverges|because|limit|approx)\b",
    flags=re.IGNORECASE,
)


def _contains_math_tokens(value: str) -> bool:
    return bool(value and _MATH_TOKEN_RE.search(value))


def _contains_english_words(value: str) -> bool:
    return bool(value and _ENGLISH_IN_MATH_RE.search(value))


def _validate_math_formatting(flow: dict, is_math_course: bool) -> None:
    if not is_math_course:
        return
    steps = flow.get("steps")
    if not isinstance(steps, dict):
        raise AIFlowError("Flow steps must be an object")
    for step in steps.values():
        if not isinstance(step, dict):
            continue
        prompt_text = (step.get("prompt_text") or step.get("promptText") or "").strip()
        prompt_math = (step.get("prompt_math") or step.get("promptMath") or "").strip()
        if _contains_math_tokens(prompt_text) and not prompt_math:
            raise AIFlowError("prompt_text contains math but prompt_math is empty")
        if prompt_math and _contains_english_words(prompt_math):
            raise AIFlowError("prompt_math contains English words")
        if step.get("type") != "MC":
            continue
        options = step.get("options") or []
        for option in options:
            if not isinstance(option, dict):
                continue
            text = (option.get("text") or "").strip()
            math = (option.get("math") or "").strip()
            if text == "" and math == "":
                raise AIFlowError("MC option is empty")
            if _contains_math_tokens(text) and not math:
                raise AIFlowError("MC option text contains math but math is empty")
            if math and _contains_english_words(math):
                raise AIFlowError("MC option math contains English words")
