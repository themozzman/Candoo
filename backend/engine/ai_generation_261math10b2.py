import json
import re

from . import ai_generation_calc10b as base
from . import ai_generation_calc10b_F7 as f7_generator


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

PLACEHOLDER_RUBRIC = {
    "outcome": "Placeholder rubric (to be specified).",
    "requirements": ["To be defined."],
    "response_format": ["To be defined."],
}

RUBRICS_BY_FOLDER = {
    "G6": G6_RUBRIC,
    "F7": None,
    "G7": PLACEHOLDER_RUBRIC,
    "G8": PLACEHOLDER_RUBRIC,
    "G9": PLACEHOLDER_RUBRIC,
}


def generate_spec(topic: str, course: dict) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(course.get("tags"))
    folder_name = course.get("folder_name") or "G6"
    if folder_name == "F7":
        return f7_generator.generate_spec(topic, course)
    rubric = RUBRICS_BY_FOLDER.get(folder_name)
    if rubric is None and folder_name != "F7":
        raise AIFlowError(
            f"Rubric for folder {folder_name} is not implemented yet."
        )
    prompt = (
        "You are a curriculum designer for a calculus course.\n"
        f"Create a JSON teaching spec for folder {folder_name}.\n"
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
        f"{'' if rubric is None else f'Rubric JSON:\\n{json.dumps(rubric, indent=2)}\\n\\n'}"
        "Question types allowed: SA, MC.\n"
        f"{'' if rubric is None else 'Follow the rubric exactly for the folder.'}"
    )
    spec = base._json_response(client, prompt)
    if not isinstance(spec, dict):
        raise AIFlowError("Spec response must be a JSON object")
    spec["topic"] = topic
    spec["course_id"] = course.get("id")
    spec["course_tags"] = course_tags
    if rubric is not None:
        spec["rubric"] = rubric
    spec["folder_id"] = course.get("folder_id")
    spec["folder_name"] = folder_name
    return spec


def generate_flow(spec: dict, flow_id: str) -> dict:
    client = base._client()
    course_tags = base._normalize_tags(spec.get("course_tags") or spec.get("tags"))
    is_math_course = "math" in course_tags
    folder_name = spec.get("folder_name") or "G6"
    if folder_name == "F7":
        return f7_generator.generate_flow(spec, flow_id)
    if folder_name == "G6":
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
            "- Include BOTH answer styles in answer.values:\n"
            "  1) Signed integrals (e.g., -∫ f(x) dx + ∫ f(x) dx)\n"
            "  2) Upper-minus-lower integrands (e.g., ∫ (upper - lower) dx)\n"
            "- Use \\int and standard LaTeX, no evaluation.\n\n"
            "Example answer (format only):\n"
            '  "\\\\int_{a}^{b} (f(x)-g(x)) \\\\, dx + \\\\int_{b}^{c} (g(x)-f(x)) \\\\, dx"\n\n'
            f"flow_id: {flow_id}\n"
            f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
            f"Spec JSON:\n{json.dumps(spec, indent=2)}"
        )
    elif folder_name == "F7":
        prompt = (
            "You are generating a learning flow JSON for a calculus quiz.\n"
            "This is Outcome F7: evaluate integrals using substitution.\n"
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
            '        "insights": { "skill": "<string>", "rule": "<string>", "misconception_focus": "<string>" },\n'
            '        "f7_type": "identify_ud_mc" | "identify_ud_sa" | "compute_definite" | "compute_indefinite"\n'
            "     }\n"
            "  }\n"
            "}\n\n"
            "F7 REQUIRED QUESTION TYPES (include all):\n"
            "1) MC: identify u and du for an integral.\n"
            "2) SA: identify u and du for an integral.\n"
            "3) SA: bounded integral evaluation (numeric final answer).\n"
            "4) SA: unbounded (indefinite) integral evaluation (+C required).\n"
            "Use 4-6 steps total and cover all four types.\n\n"
            "PROMPT FORMAT (no English+math mixing):\n"
            "- For types 1 & 2:\n"
                    '  prompt_text: "Identify and set u and du for the following integral. Format: u equals ..., du equals ..."\n'
            "  prompt_math: <integral only in LaTeX>\n"
                    "  (Do not use '=' or any math symbols in prompt_text.)\n"
            "- For types 3 & 4:\n"
            '  prompt_text: "Compute the following integral"\n'
            "  prompt_math: <integral only in LaTeX>\n\n"
            "MC OPTIONS:\n"
            "- Each option must put the full u/du pair in option.math.\n"
            "- option.text must be empty for MC u/du choices.\n"
            "- Do NOT use math symbols in prompt_text.\n"
            "- Use prompt_math for the integral only.\n\n"
            "ANSWER RULES:\n"
            "- Indefinite results must include + C.\n"
            "- Definite results must be a number (evaluate bounds).\n"
            "- Always show correct u and du in solutions.\n\n"
            "STRUCTURE RULE:\n"
            "- The final step must set next.correct/next.wrong/next.skip to null.\n\n"
            f"flow_id: {flow_id}\n"
            f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
            f"Spec JSON:\n{json.dumps(spec, indent=2)}"
        )
    else:
        raise AIFlowError(
            f"Quiz generator for folder {folder_name} is not implemented yet."
        )
    flow = base._json_response(client, prompt)
    if not isinstance(flow, dict):
        raise AIFlowError("Flow response must be a JSON object")
    flow["schemaVersion"] = 1
    flow["id"] = flow_id
    if folder_name == "F7":
        _repair_f7_flow(flow)
    if folder_name == "G6":
        _validate_g6_flow(flow)
    base._repair_math_formatting(flow, is_math_course)
    base._validate_math_formatting(flow, is_math_course)
    base._shuffle_mc_options(flow)
    return flow


_G6_ABS_RE = re.compile(r"(\\left\|)|(\\right\|)|\||\\abs|\\lvert|\\rvert", re.IGNORECASE)
_G6_INTEGRAL_RE = re.compile(r"(\\int|\bint\b|∫|\bIntegral\(|\bintegral\b)", re.IGNORECASE)
_G6_BOUNDS_RE = re.compile(r"(_\{[^}]+\}\s*\^\{[^}]+\})|\bfrom\b.+\bto\b", re.IGNORECASE)
_G6_DIFF_RE = re.compile(r"d\s*[a-zA-Z]", re.IGNORECASE)
_G6_SIGNED_RE = re.compile(r"(^|\s)-\s*\\int", re.IGNORECASE)
_G6_UPPER_LOWER_RE = re.compile(r"\(([^)]+)-([^)]+)\)")


def _validate_g6_flow(flow: dict) -> None:
    steps = flow.get("steps")
    if not isinstance(steps, dict) or not steps:
        raise AIFlowError("Flow steps must be an object")
    for step_id, step in steps.items():
        if not isinstance(step, dict):
            continue
        if step.get("type") != "SA":
            continue
        answer = step.get("answer") or {}
        values = answer.get("values") or []
        if not values or not isinstance(values, list):
            raise AIFlowError(f"G6 step {step_id} must include answer.values")
        has_signed = False
        has_upper_lower = False
        for value in values:
            if not isinstance(value, str):
                continue
            if _G6_ABS_RE.search(value):
                raise AIFlowError("G6 answers must not include absolute values")
            has_integral = _G6_INTEGRAL_RE.search(value)
            has_bounds = _G6_BOUNDS_RE.search(value)
            has_diff = _G6_DIFF_RE.search(value)
            if not (has_integral or (has_bounds and has_diff)):
                raise AIFlowError("G6 answers must include definite integrals")
            if _G6_SIGNED_RE.search(value):
                has_signed = True
            if _G6_UPPER_LOWER_RE.search(value):
                has_upper_lower = True
        if not (has_signed and has_upper_lower):
            raise AIFlowError(
                "G6 answers must include both signed and upper-minus-lower formats"
            )


def _repair_f7_flow(flow: dict) -> None:
    steps = flow.get("steps")
    if not isinstance(steps, dict) or not steps:
        raise AIFlowError("Flow steps must be an object")
    f7_type_text = {
        "identify_ud_mc": "Identify and set u and du for the following integral. Format: u equals ..., du equals ...",
        "identify_ud_sa": "Identify and set u and du for the following integral. Format: u equals ..., du equals ...",
        "compute_definite": "Compute the following integral",
        "compute_indefinite": "Compute the following integral",
    }
    step_ids = list(steps.keys())
    remaining = {"identify_ud_mc", "identify_ud_sa", "compute_definite", "compute_indefinite"}
    for step_id, step in steps.items():
        if not isinstance(step, dict):
            continue
        original_prompt_text = step.get("prompt_text") or ""
        original_prompt_math = step.get("prompt_math") or ""
        f7_type = step.get("f7_type")
        if not f7_type:
            step_type = step.get("type")
            if step_type == "MC":
                f7_type = "identify_ud_mc"
            elif step_type == "SA":
                f7_type = "compute_indefinite"
            step["f7_type"] = f7_type
        if f7_type in f7_type_text:
            step["prompt_text"] = f7_type_text[f7_type]
        prompt_math = step.get("prompt_math") or ""
        if not prompt_math and original_prompt_text:
            _, extracted_math = base._split_text_math(original_prompt_text)
            if extracted_math:
                step["prompt_math"] = extracted_math
                prompt_math = extracted_math
        if isinstance(prompt_math, str) and prompt_math.startswith("\\int"):
            prompt_math = prompt_math.replace("\n", " ").strip()
            prompt_math = " ".join(prompt_math.split())
            step["prompt_math"] = prompt_math
        if base._contains_math_tokens(step.get("prompt_text") or ""):
            step["prompt_text"] = f7_type_text.get(f7_type, "")
        remaining.discard(f7_type)
        step_type = step.get("type")
        if step_type == "MC":
            options = step.get("options") or []
            for option in options:
                if not isinstance(option, dict):
                    continue
                if option.get("text"):
                    option["math"] = option.get("math") or option.get("text")
                    option["text"] = ""
            answer = step.get("answer") or {}
            if answer.get("kind") != "exact":
                answer["kind"] = "exact"
            if "value" not in answer and options:
                answer["value"] = options[0].get("value")
            step["answer"] = answer
        elif step_type == "SA":
            answer = step.get("answer") or {}
            if answer.get("kind") != "normalized_set":
                values = answer.get("values") or []
                if not values and answer.get("value"):
                    values = [answer.get("value")]
                answer = {"kind": "normalized_set", "values": values, "normalize": ["trim", "lowercase", "remove_spaces"]}
            step["answer"] = answer

    if remaining:
        for step_id in step_ids:
            step = steps.get(step_id)
            if not isinstance(step, dict):
                continue
            f7_type = step.get("f7_type")
            if f7_type in remaining:
                continue
            if not remaining:
                break
            step_type = step.get("type")
            if step_type == "MC":
                candidates = [t for t in remaining if t == "identify_ud_mc"]
            elif step_type == "SA":
                candidates = [t for t in remaining if t in {"identify_ud_sa", "compute_definite", "compute_indefinite"}]
            else:
                candidates = []
            if not candidates:
                continue
            next_type = sorted(candidates)[0]
            step["f7_type"] = next_type
            step["prompt_text"] = f7_type_text[next_type]
            remaining.discard(next_type)

    if step_ids:
        last_step = steps.get(step_ids[-1])
        if isinstance(last_step, dict):
            last_step["next"] = {"correct": None, "wrong": None, "skip": None}


