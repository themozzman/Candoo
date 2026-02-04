from .ai_generation_calc10b import AIFlowError, generate_attempt_feedback, now_label


COURSE_ID = "spanish-2"
COURSE_LABEL = "Spanish 2"


def generate_spec(topic: str, course: dict) -> dict:
    raise AIFlowError(
        f"Quiz generator for {COURSE_LABEL} ({COURSE_ID}) is not implemented yet."
    )


def generate_flow(spec: dict, flow_id: str) -> dict:
    raise AIFlowError(
        f"Quiz generator for {COURSE_LABEL} ({COURSE_ID}) is not implemented yet."
    )
