from . import ai_generation_calc10b as base


AIFlowError = base.AIFlowError
generate_attempt_feedback = base.generate_attempt_feedback
now_label = base.now_label

COURSE_ID = "math-10a"
COURSE_LABEL = "MATH 10A"

SUPPORTED_FOLDERS = {"F7", "G8", "G9", "G10", "G11", "G12"}


def _folder_name(course_or_spec: dict) -> str:
    return course_or_spec.get("folder_name") or course_or_spec.get("folder_id") or "G8"


def generate_spec(topic: str, course: dict) -> dict:
    folder_name = _folder_name(course)
    if folder_name not in SUPPORTED_FOLDERS:
        raise AIFlowError(
            f"Folder {folder_name} is not supported for {COURSE_LABEL}."
        )
    raise AIFlowError(
        f"{COURSE_LABEL} generator for folder {folder_name} is not implemented yet."
    )


def generate_flow(spec: dict, flow_id: str) -> dict:
    folder_name = _folder_name(spec)
    if folder_name not in SUPPORTED_FOLDERS:
        raise AIFlowError(
            f"Folder {folder_name} is not supported for {COURSE_LABEL}."
        )
    raise AIFlowError(
        f"{COURSE_LABEL} flow generator for folder {folder_name} is not implemented yet."
    )
