import json
import os
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
        '        "prompt": "<string>",\n'
        '        "options": ["real answer text", "real answer text"]  // MC only,\n'
        '        "answer": { "kind": "exact", "value": "<option>" }  // MC\n'
        '        "answer": { "kind": "normalized_set", "values": ["..."], "normalize": ["trim","lowercase"] }  // SA\n'
        '        "feedback": { "wrongHint": "<string>", "explanation": "<string>" },\n'
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
        "- MC options must be full, meaningful answer strings (no single-letter placeholders like A/B/C/D).\n"
        "- Use realistic answer options and feedback.\n"
        "- Use the provided flow_id.\n\n"
        f"flow_id: {flow_id}\n"
        f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    flow = _json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    return flow


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
