import random

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

    mc_generators = [
        _mc_product_rule,
        _mc_product_rule,
        _mc_quotient_rule,
        _mc_chain_rule,
    ]
    sa_generators = [
        _sa_chain_rule,
        _sa_product_rule,
        _sa_quotient_rule,
        _sa_chain_rule,
        _sa_chain_rule,
        _sa_chain_rule,
    ]
    random.shuffle(mc_generators)
    random.shuffle(sa_generators)

    steps = []
    for idx, generator in enumerate(mc_generators + sa_generators, start=1):
        steps.append(generator(f"step{idx}"))

    random.shuffle(steps)
    for idx, step in enumerate(steps, start=1):
        step["id"] = f"step{idx}"
    _link_steps(steps)

    steps_by_id = {step["id"]: step for step in steps}
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


def _rand_int(low: int, high: int, exclude: set[int] | None = None) -> int:
    exclude = exclude or set()
    value = random.randint(low, high)
    while value in exclude:
        value = random.randint(low, high)
    return value


def _mc_product_rule(step_id: str) -> dict:
    a = _rand_int(2, 5)
    n = _rand_int(2, 4)
    b = _rand_int(1, 5)
    prompt = rf"({a}x^{n}+{b}x)\sin x"
    correct = rf"({a*n}x^{n-1}+{b})\sin x + ({a}x^{n}+{b}x)\cos x"
    distractors = [
        rf"({a*n}x^{n-1}+{b})\sin x",
        rf"({a}x^{n}+{b}x)\cos x",
        rf"({a*n}x^{n-1}+{b})\cos x + ({a}x^{n}+{b}x)\sin x",
    ]
    return _mc_step(step_id, prompt, correct, distractors, "Product rule")


def _mc_quotient_rule(step_id: str) -> dict:
    a = _rand_int(2, 4)
    b = _rand_int(1, 5)
    c = _rand_int(2, 5)
    d = _rand_int(1, 4)
    prompt = rf"\frac{{{a}x^{2}+{b}}}{{x-{c}}}"
    correct = rf"\frac{{2{a}x(x-{c})-({a}x^{2}+{b})}}{{(x-{c})^{2}}}"
    distractors = [
        rf"\frac{{2{a}x(x-{c})+({a}x^{2}+{b})}}{{(x-{c})^{2}}}",
        rf"\frac{{2{a}x(x-{c})-({a}x^{2}+{b})}}{{x-{c}}}",
        rf"\frac{{2{a}x}}{{x-{c}}}",
    ]
    return _mc_step(step_id, prompt, correct, distractors, "Quotient rule")


def _mc_chain_rule(step_id: str) -> dict:
    a = _rand_int(2, 4)
    b = _rand_int(1, 5)
    p = _rand_int(3, 6)
    prompt = rf"(x^{2}+{a}x+{b})^{p}"
    correct = rf"{p}(x^{2}+{a}x+{b})^{p-1}(2x+{a})"
    distractors = [
        rf"(2x+{a})",
        rf"{p}(x^{2}+{a}x+{b})^{p-1}",
        rf"{p}(x^{2}+{a}x+{b})^{p}(2x+{a})",
    ]
    return _mc_step(step_id, prompt, correct, distractors, "Chain rule")


def _sa_chain_rule(step_id: str) -> dict:
    a = _rand_int(2, 5)
    b = _rand_int(1, 6)
    p = random.choice([3, 4, 5])
    prompt = rf"({a}x^{2}-{b})^{p}"
    answers = [
        rf"{p}({a}x^{2}-{b})^{p-1}\cdot {2*a}x",
        rf"{p}({a}x^{2}-{b})^{p-1}{2*a}x",
    ]
    return _sa_step(step_id, prompt, answers, "Chain rule")


def _sa_product_rule(step_id: str) -> dict:
    k = _rand_int(2, 4)
    prompt = rf"e^{{{k}x}}\cos x"
    answers = [
        rf"{k}e^{{{k}x}}\cos x - e^{{{k}x}}\sin x",
        rf"e^{{{k}x}}({k}\cos x - \sin x)",
    ]
    return _sa_step(step_id, prompt, answers, "Product rule")


def _sa_quotient_rule(step_id: str) -> dict:
    a = _rand_int(1, 4)
    b = _rand_int(1, 5)
    prompt = rf"\frac{{\ln x}}{{x^{a}+{b}}}"
    answers = [
        rf"\frac{{(x^{a}+{b})\cdot \frac{{1}}{{x}} - {a}x^{a-1}\ln x}}{{(x^{a}+{b})^{2}}}",
        rf"\frac{{\frac{{x^{a}+{b}}}{{x}} - {a}x^{a-1}\ln x}}{{(x^{a}+{b})^{2}}}",
    ]
    return _sa_step(step_id, prompt, answers, "Quotient rule")
