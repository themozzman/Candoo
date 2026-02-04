from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label


COURSE_ID = "261fren-20b-1"
COURSE_LABEL = "261FREN-20B-1"


def generate_spec(topic: str, course: dict) -> dict:
    return base.generate_spec(topic, course)


def generate_flow(spec: dict, flow_id: str) -> dict:
    return base.generate_flow(spec, flow_id)
