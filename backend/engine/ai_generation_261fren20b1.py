from .ai_generation_calc10b import AIFlowError, generate_attempt_feedback, now_label


COURSE_ID = "261fren-20b-1"
COURSE_LABEL = "261FREN-20B-1"


def generate_spec(topic: str, course: dict) -> dict:
    raise AIFlowError(
        f"Quiz generator for {COURSE_LABEL} ({COURSE_ID}) is not implemented yet."
    )


def generate_flow(spec: dict, flow_id: str) -> dict:
    raise AIFlowError(
        f"Quiz generator for {COURSE_LABEL} ({COURSE_ID}) is not implemented yet."
    )
