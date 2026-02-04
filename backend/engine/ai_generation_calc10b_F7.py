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

F7_MATH_ONLY_INSTRUCTIONS = (
    "You are generating math-only content for a calculus quiz (F7: substitution).\n"
    "Return ONLY valid JSON with these keys (all values are LaTeX-only, no English):\n"
    "{\n"
    '  "integral_for_u": "<latex integral>",\n'
    '  "u_expression": "<latex expression>",\n'
    '  "du_expression": "<latex expression>",\n'
    '  "bounded_integral": "<latex integral with bounds>",\n'
    '  "bounded_answer": "<latex numeric result>",\n'
    '  "unbounded_integral": "<latex integral>",\n'
    '  "unbounded_answer": "<latex antiderivative with + C>"\n'
    "}\n\n"
    "Rules:\n"
    "- Provide math only (no words like 'from', 'to', 'evaluate', etc.).\n"
    "- The u_expression must match the integral_for_u.\n"
    "- The du_expression must be the correct differential for u.\n"
    "- bounded_integral must be different from integral_for_u.\n"
    "- unbounded_integral must be different from integral_for_u.\n"
    "- bounded_integral and unbounded_integral must be different from each other.\n"
    "- bounded_answer must be a number.\n"
    "- unbounded_answer must include + C.\n"
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
    prompt = (
        F7_MATH_ONLY_INSTRUCTIONS
        + "\n\n"
        + f"Course tags: {', '.join(course_tags) if course_tags else 'none'}\n"
        + f"Spec JSON:\n{json.dumps(spec, indent=2)}"
    )
    math_payload = base._json_response(client, prompt)
    if not isinstance(math_payload, dict):
        raise AIFlowError("Math response must be a JSON object")

    def _values(value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return [str(item) for item in value if str(item).strip()]
        if value is None:
            return []
        return [str(value)]

    step_ids = ["step1", "step2", "step3", "step4"]
    flow = {
        "schemaVersion": 1,
        "id": flow_id,
        "title": spec.get("title") or "F7 Substitution",
        "topic": spec.get("topic") or "Substitution",
        "statement": spec.get("statement") or "",
        "startStepId": step_ids[0],
        "steps": {
            "step1": {
                "id": "step1",
                "type": "SA",
                "prompt_text": "Identify the correct choice of u for the following integral.",
                "prompt_math": math_payload.get("integral_for_u", ""),
                "answer": {
                    "kind": "normalized_set",
                    "values": _values(math_payload.get("u_expression", "")),
                    "normalize": ["trim", "lowercase", "remove_spaces"],
                },
                "feedback": {"wrongHint": "", "explanation": ""},
                "solution": {"steps": []},
                "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
                "next": {"correct": "step2", "wrong": "step2", "skip": "step2"},
            },
            "step2": {
                "id": "step2",
                "type": "SA",
                "prompt_text": "Identify the correct choice of du for the following substitution.",
                "prompt_math": math_payload.get("u_expression", ""),
                "answer": {
                    "kind": "normalized_set",
                    "values": _values(math_payload.get("du_expression", "")),
                    "normalize": ["trim", "lowercase", "remove_spaces"],
                },
                "feedback": {"wrongHint": "", "explanation": ""},
                "solution": {"steps": []},
                "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
                "next": {"correct": "step3", "wrong": "step3", "skip": "step3"},
            },
            "step3": {
                "id": "step3",
                "type": "SA",
                "prompt_text": "Compute the following integral.",
                "prompt_math": math_payload.get("bounded_integral", ""),
                "answer": {
                    "kind": "normalized_set",
                    "values": _values(math_payload.get("bounded_answer", "")),
                    "normalize": ["trim", "lowercase", "remove_spaces"],
                },
                "feedback": {"wrongHint": "", "explanation": ""},
                "solution": {"steps": []},
                "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
                "next": {"correct": "step4", "wrong": "step4", "skip": "step4"},
            },
            "step4": {
                "id": "step4",
                "type": "SA",
                "prompt_text": "Compute the following integral.",
                "prompt_math": math_payload.get("unbounded_integral", ""),
                "answer": {
                    "kind": "normalized_set",
                    "values": _values(math_payload.get("unbounded_answer", "")),
                    "normalize": ["trim", "lowercase", "remove_spaces"],
                },
                "feedback": {"wrongHint": "", "explanation": ""},
                "solution": {"steps": []},
                "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
                "next": {"correct": None, "wrong": None, "skip": None},
            },
        },
    }
    return flow

