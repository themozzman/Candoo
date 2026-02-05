from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label

COURSE_ID = "math-10a"
COURSE_LABEL = "MATH 10A"
FOLDER_NAME = "F7"


def _folder_name(course_or_spec: dict) -> str:
    return course_or_spec.get("folder_name") or course_or_spec.get("folder_id") or FOLDER_NAME


def generate_spec(topic: str, course: dict) -> dict:
    folder_name = _folder_name(course)
    if folder_name != FOLDER_NAME:
        raise AIFlowError(
            f"Folder {folder_name} is not supported for {COURSE_LABEL}."
        )
    course_tags = base._normalize_tags(course.get("tags"))
    return {
        "topic": topic,
        "course_id": course.get("id") or COURSE_ID,
        "course_tags": course_tags,
        "learning_goals": [
            "Apply product, quotient, and chain rules correctly.",
            "Differentiate expressions with trig, exponential, and logarithmic terms.",
        ],
        "rules_to_test": [
            {"id": "product", "description": "Use the product rule correctly."},
            {"id": "quotient", "description": "Use the quotient rule correctly."},
            {"id": "chain", "description": "Use the chain rule correctly."},
        ],
        "misconceptions": [
            {"id": "missed_term", "description": "Missing one term in product rule."},
            {"id": "sign_error", "description": "Incorrect sign in quotient rule."},
            {"id": "outer_only", "description": "Apply chain rule but omit inner derivative."},
        ],
        "question_blueprint": [
            {"rule_id": "product", "question_type": "MC", "count": 2},
            {"rule_id": "quotient", "question_type": "MC", "count": 1},
            {"rule_id": "chain", "question_type": "MC", "count": 1},
            {"rule_id": "product", "question_type": "SA", "count": 1},
            {"rule_id": "quotient", "question_type": "SA", "count": 1},
            {"rule_id": "chain", "question_type": "SA", "count": 4},
        ],
        "analytics_goals": [
            "Track product, quotient, and chain rule mastery.",
        ],
        "notes": "10 questions total, mixed MC and SA, no simplification required.",
        "rubric": {
            "outcome": "F7: Calculate derivatives of functions.",
            "requirements": [
                "Include product, quotient, and chain rule problems.",
                "Mix trig, exponential, and logarithmic expressions.",
                "No simplification required.",
            ],
            "response_format": [
                "Provide derivative expressions in standard form.",
                "Equivalent unsimplified forms are accepted.",
            ],
        },
        "folder_id": course.get("folder_id"),
        "folder_name": folder_name,
    }


def generate_flow(spec: dict, flow_id: str) -> dict:
    folder_name = _folder_name(spec)
    if folder_name != FOLDER_NAME:
        raise AIFlowError(
            f"Folder {folder_name} is not supported for {COURSE_LABEL}."
        )

    steps = [
        _mc_step(
            "step1",
            r"(x^3 + 2x)\sin x",
            r"(3x^2+2)\sin x + (x^3+2x)\cos x",
            [
                r"(3x^2+2)\sin x",
                r"(x^3+2x)\cos x",
                r"(3x^2+2)\cos x + (x^3+2x)\sin x",
            ],
            skill="Product rule",
        ),
        _sa_step(
            "step2",
            r"(2x^2 - 5)^4",
            [
                r"16x(2x^2-5)^3",
                r"4(2x^2-5)^3\cdot 4x",
            ],
            skill="Chain rule",
        ),
        _mc_step(
            "step3",
            r"\frac{x^2+1}{x-3}",
            r"\frac{2x(x-3)-(x^2+1)}{(x-3)^2}",
            [
                r"\frac{2x(x-3)+(x^2+1)}{(x-3)^2}",
                r"\frac{2x(x-3)-(x^2+1)}{x-3}",
                r"\frac{2x}{x-3}",
            ],
            skill="Quotient rule",
        ),
        _sa_step(
            "step4",
            r"e^{2x}\cos x",
            [
                r"2e^{2x}\cos x - e^{2x}\sin x",
                r"e^{2x}(2\cos x - \sin x)",
            ],
            skill="Product rule",
        ),
        _mc_step(
            "step5",
            r"(x^2+3x)^5",
            r"5(x^2+3x)^4(2x+3)",
            [
                r"(2x+3)",
                r"5(x^2+3x)^4",
                r"5(x^2+3x)^5(2x+3)",
            ],
            skill="Chain rule",
        ),
        _sa_step(
            "step6",
            r"\frac{\ln x}{x^2+1}",
            [
                r"\frac{(x^2+1)\cdot \frac{1}{x} - 2x\ln x}{(x^2+1)^2}",
                r"\frac{\frac{x^2+1}{x} - 2x\ln x}{(x^2+1)^2}",
            ],
            skill="Quotient rule",
        ),
        _mc_step(
            "step7",
            r"3^x",
            r"(\ln 3)3^x",
            [
                r"3^x\ln x",
                r"3^{x-1}",
                r"\frac{3^x}{x}",
            ],
            skill="Exponential derivatives",
        ),
        _sa_step(
            "step8",
            r"\sin(3x^2-1)",
            [
                r"6x\cos(3x^2-1)",
                r"\cos(3x^2-1)\cdot 6x",
            ],
            skill="Chain rule",
        ),
        _sa_step(
            "step9",
            r"e^{\sqrt{x}}",
            [
                r"\frac{e^{\sqrt{x}}}{2\sqrt{x}}",
                r"e^{\sqrt{x}}\cdot \frac{1}{2\sqrt{x}}",
            ],
            skill="Chain rule",
        ),
        _sa_step(
            "step10",
            r"\sqrt{5x^3+4x}",
            [
                r"\frac{15x^2+4}{2\sqrt{5x^3+4x}}",
                r"\frac{1}{2}(5x^3+4x)^{-1/2}(15x^2+4)",
            ],
            skill="Chain rule",
        ),
    ]

    steps_by_id = {step["id"]: step for step in steps}
    _link_steps(steps)
    return {
        "schemaVersion": 1,
        "id": flow_id,
        "title": spec.get("title") or "F7 Derivatives Practice",
        "topic": spec.get("topic") or "Derivatives",
        "statement": spec.get("statement") or "Differentiate each function.",
        "startStepId": steps[0]["id"],
        "steps": steps_by_id,
    }


def _mc_step(step_id: str, prompt_math: str, correct: str, distractors: list[str], skill: str) -> dict:
    options = [correct] + distractors
    option_payload = []
    for index, math in enumerate(options, start=1):
        option_payload.append({"value": f"opt{index}", "text": "", "math": math})
    return {
        "id": step_id,
        "type": "MC",
        "prompt_text": "Differentiate:",
        "prompt_math": prompt_math,
        "options": option_payload,
        "answer": {"kind": "exact", "value": "opt1"},
        "feedback": {
            "wrongHint": "Review the derivative rules used here.",
            "explanation": "Apply the correct rule carefully.",
        },
        "solution": {"steps": []},
        "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
        "next": {"correct": None, "wrong": None, "skip": None},
        "insights": {
            "skill": skill,
            "rule": skill,
            "misconception_focus": "Common rule mistake",
        },
    }


def _sa_step(step_id: str, prompt_math: str, answers: list[str], skill: str) -> dict:
    return {
        "id": step_id,
        "type": "SA",
        "prompt_text": "Differentiate:",
        "prompt_math": prompt_math,
        "answer": {
            "kind": "normalized_set",
            "values": answers,
            "normalize": ["trim", "lowercase", "remove_spaces"],
        },
        "feedback": {
            "wrongHint": "Check your derivative rules and try again.",
            "explanation": "Apply the rule(s) correctly.",
        },
        "solution": {"steps": []},
        "attemptPolicy": {"revealAfter": 2, "allowSkip": True},
        "next": {"correct": None, "wrong": None, "skip": None},
        "insights": {
            "skill": skill,
            "rule": skill,
            "misconception_focus": "Common rule mistake",
        },
    }


def _link_steps(steps: list[dict]) -> None:
    for idx, step in enumerate(steps):
        next_id = steps[idx + 1]["id"] if idx + 1 < len(steps) else None
        step["next"] = {"correct": next_id, "wrong": next_id, "skip": next_id}
