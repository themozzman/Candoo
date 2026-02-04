from importlib import import_module

from . import ai_generation_calc10b


AIFlowError = ai_generation_calc10b.AIFlowError
now_label = ai_generation_calc10b.now_label

COURSE_GENERATORS = {
    "261math-10b-2": "engine.ai_generation_261math10b2",
    "calc-10b": "engine.ai_generation_calc10b",
    "french-10a": "engine.ai_generation_french10a",
    "french-20b": "engine.ai_generation_french20b",
    "spanish-2": "engine.ai_generation_spanish2",
}
DEFAULT_COURSE_ID = "calc-10b"


def get_quiz_generator(course_id: str):
    module_path = COURSE_GENERATORS.get(course_id, COURSE_GENERATORS[DEFAULT_COURSE_ID])
    return import_module(module_path)


def generate_attempt_feedback(
    question: str,
    correct_answer: str,
    attempt: str,
    attempt_number: int,
) -> dict:
    return ai_generation_calc10b.generate_attempt_feedback(
        question=question,
        correct_answer=correct_answer,
        attempt=attempt,
        attempt_number=attempt_number,
    )
