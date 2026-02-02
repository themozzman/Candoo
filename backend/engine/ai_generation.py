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
        "Question types allowed: MC, SA, SPOT_ERROR.\n"
        "Make analytics goals explicit so the flow can capture insights."
    )
    spec = _json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = _client()
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
        "- Use prompt_text for English-only instructions with NO math tokens.\n"
        "- Put all math notation in prompt_math as LaTeX (e.g. \\int_0^\\infty \\frac{1}{x} dx).\n"
        "- If a step has no math, leave prompt_math as an empty string.\n"
        "- For MC options, keep text for English-only content and math for LaTeX; do not mix.\n"
        "- If a step or option includes math, its math field MUST be populated.\n"
        "- The final step must terminate the flow by setting next.correct/next.wrong/next.skip to null.\n"
        "- Use realistic answer options and feedback.\n"
        "- For SA steps, include solution.steps with 2-5 concise items.\n"
        "- Each solution step should have a short text and a math expression.\n"
        "- The math expression should show the algebraic transformation or intermediate form.\n"
        "- Use the provided flow_id.\n\n"
        f"flow_id: {flow_id}\n"
        f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    flow = _json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    flow = _normalize_flow_math(flow)
    return flow


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


def _normalize_flow_math(flow: dict) -> dict:
    steps = flow.get("steps")
    if not isinstance(steps, dict):
        return flow

    for step in steps.values():
        if not isinstance(step, dict):
            continue
        _normalize_step_prompt(step)
        _normalize_step_options(step)
        _assert_step_math_clean(step)

    return flow


def _normalize_step_prompt(step: dict) -> None:
    prompt_text = step.get("prompt_text") or step.get("promptText") or ""
    prompt_math = step.get("prompt_math") or step.get("promptMath") or ""
    if not prompt_text and isinstance(step.get("prompt"), str):
        prompt_text = step.get("prompt") or ""
    if not prompt_math and _contains_math(prompt_text):
        text, math = _split_prompt_text_math(prompt_text)
        text, math = _repair_prompt_split(text, math)
        prompt_text = text
        prompt_math = math
    step["prompt_text"] = prompt_text.strip()
    step["prompt_math"] = prompt_math.strip()
    if "prompt" in step and step["prompt"] is not None:
        step["prompt"] = None


def _normalize_step_options(step: dict) -> None:
    if step.get("type") != "MC":
        return
    options = step.get("options")
    if not isinstance(options, list):
        return
    normalized = []
    for idx, option in enumerate(options):
        if isinstance(option, dict):
            text = (option.get("text") or "").strip()
            math = (option.get("math") or "").strip()
            value = option.get("value") or f"option{idx + 1}"
            if not math and _contains_math(text):
                text, math = _split_option_text_math(text)
            normalized.append({"value": value, "text": text, "math": math})
        else:
            raw = str(option).strip()
            text, math = _split_option_text_math(raw)
            normalized.append({"value": f"option{idx + 1}", "text": text, "math": math})
    step["options"] = normalized

    answer = step.get("answer")
    if isinstance(answer, dict) and answer.get("kind") == "exact":
        raw_value = answer.get("value")
        if raw_value:
            match = next(
                (opt for opt in normalized if opt["value"] == raw_value),
                None,
            )
            if match is None:
                for opt in normalized:
                    if opt["text"] == raw_value or opt["math"] == raw_value:
                        answer["value"] = opt["value"]
                        break


def _contains_math(value: str) -> bool:
    return bool(
        re.search(
            r"[=^]|\\|∫|∞|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root)\b|\bpi\b|π",
            value,
            flags=re.IGNORECASE,
        )
    )


def _split_prompt_text_math(value: str) -> tuple[str, str]:
    match = re.search(
        r"(∫\s*from\s*.+|\bint\b|\\int|[a-zA-Z]\s*\^|[a-zA-Z]\s*\(|∞|π)",
        value,
        flags=re.IGNORECASE,
    )
    if not match:
        return value.strip(), ""
    idx = match.start()
    if idx > 0 and value[idx - 1].isalnum():
        return value.strip(), ""
    text = value[:idx].strip()
    math = value[idx:].strip()
    return text, math


def _repair_prompt_split(text: str, math: str) -> tuple[str, str]:
    if not text or not math:
        return text, math
    last_word = re.search(r"([A-Za-z]+)$", text)
    first_word = re.match(r"^([A-Za-z]+)", math)
    if not last_word or not first_word:
        return text, math
    if (last_word.group(1) + first_word.group(1)).lower() in {"sin", "cos", "tan", "sec", "csc", "cot"}:
        merged = last_word.group(1) + first_word.group(1)
        text = text[: -len(last_word.group(1))].rstrip()
        math = math[len(first_word.group(1)) :].lstrip()
        if math and not math.startswith("("):
            math = f"{merged} {math}"
        else:
            math = f"{merged}{math}"
        return text, math
    return text, math


def _split_option_text_math(value: str) -> tuple[str, str]:
    if not _contains_math(value):
        return value, ""
    return "", value


def _assert_step_math_clean(step: dict) -> None:
    prompt_text = step.get("prompt_text") or ""
    if _contains_math(prompt_text):
        raise AIFlowError(
            "Generated prompt_text contains math; regenerate flow with structured math fields."
        )
    if step.get("type") != "MC":
        return
    options = step.get("options") or []
    for option in options:
        if not isinstance(option, dict):
            continue
        text = option.get("text") or ""
        math = option.get("math") or ""
        if _contains_math(text) and not math:
            raise AIFlowError(
                "Generated MC option text contains math; regenerate flow with structured math fields."
            )


def now_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
