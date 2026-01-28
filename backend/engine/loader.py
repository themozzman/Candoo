import json
from pathlib import Path


ALLOWED_STEP_TYPES = {"MC", "SA"}
ALLOWED_NORMALIZE_OPS = {"trim", "lowercase", "remove_spaces"}


class FlowValidationError(ValueError):
    pass


def load_flows(flows_dir: Path) -> dict:
    flows = {}
    if not flows_dir.exists():
        flows_dir.mkdir(parents=True, exist_ok=True)
    for path in flows_dir.glob("*.json"):
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        _validate_flow(data, source=str(path))
        flows[data["id"]] = data
    return flows


def _validate_flow(flow: dict, source: str) -> None:
    _require(flow, "schemaVersion", source)
    if flow["schemaVersion"] != 1:
        raise FlowValidationError(f"{source}: schemaVersion must be 1")

    for key in ["id", "title", "topic", "statement", "startStepId", "steps"]:
        _require(flow, key, source)

    if not isinstance(flow["steps"], dict):
        raise FlowValidationError(f"{source}: steps must be an object")

    steps = flow["steps"]
    for step_id, step in steps.items():
        if not isinstance(step, dict):
            raise FlowValidationError(f"{source}: step {step_id} must be an object")
        if step.get("id") != step_id:
            raise FlowValidationError(
                f"{source}: step key {step_id} must match step.id"
            )
        _validate_step(step, source)

    if flow["startStepId"] not in steps:
        raise FlowValidationError(f"{source}: startStepId not found in steps")

    has_terminal = False
    for step in steps.values():
        next_branch = step.get("next", {})
        if not isinstance(next_branch, dict):
            continue
        if all(next_branch.get(key) is None for key in ("correct", "wrong", "skip")):
            has_terminal = True
        for key in ("correct", "wrong", "skip"):
            target = next_branch.get(key)
            if target is None:
                continue
            if target not in steps:
                raise FlowValidationError(
                    f"{source}: step {step['id']} next.{key} references unknown step {target}"
                )

    if not has_terminal:
        raise FlowValidationError(
            f"{source}: flow must have at least one terminal step with null next values"
        )


def validate_flow(flow: dict, source: str = "api") -> None:
    _validate_flow(flow, source)


def _validate_step(step: dict, source: str) -> None:
    for key in ["id", "type", "prompt", "answer", "feedback", "attemptPolicy", "next"]:
        _require(step, key, source, prefix=f"step {step.get('id')}")

    step_type = step["type"]
    if step_type not in ALLOWED_STEP_TYPES:
        raise FlowValidationError(
            f"{source}: step {step['id']} type must be MC or SA"
        )

    if step_type == "MC":
        if "options" not in step or not isinstance(step["options"], list):
            raise FlowValidationError(
                f"{source}: step {step['id']} options must be a list for MC"
            )
        if not step["options"]:
            raise FlowValidationError(
                f"{source}: step {step['id']} options cannot be empty for MC"
            )

    answer = step["answer"]
    if not isinstance(answer, dict):
        raise FlowValidationError(f"{source}: step {step['id']} answer must be an object")

    if step_type == "MC":
        if answer.get("kind") != "exact":
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.kind must be exact for MC"
            )
        if "value" not in answer:
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.value is required for MC"
            )
        if answer["value"] not in step["options"]:
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.value must be in options"
            )
    else:
        if answer.get("kind") != "normalized_set":
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.kind must be normalized_set for SA"
            )
        if "values" not in answer or not isinstance(answer["values"], list):
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.values must be a list for SA"
            )
        if not answer["values"]:
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.values cannot be empty for SA"
            )
        normalize = answer.get("normalize", [])
        if not isinstance(normalize, list):
            raise FlowValidationError(
                f"{source}: step {step['id']} answer.normalize must be a list"
            )
        invalid = [op for op in normalize if op not in ALLOWED_NORMALIZE_OPS]
        if invalid:
            raise FlowValidationError(
                f"{source}: step {step['id']} invalid normalize ops: {invalid}"
            )

    feedback = step["feedback"]
    if not isinstance(feedback, dict):
        raise FlowValidationError(
            f"{source}: step {step['id']} feedback must be an object"
        )
    for key in ["wrongHint", "explanation"]:
        _require(feedback, key, source, prefix=f"step {step['id']} feedback")

    attempt_policy = step["attemptPolicy"]
    if not isinstance(attempt_policy, dict):
        raise FlowValidationError(
            f"{source}: step {step['id']} attemptPolicy must be an object"
        )
    for key in ["revealAfter", "allowSkip"]:
        _require(attempt_policy, key, source, prefix=f"step {step['id']} attemptPolicy")
    if not isinstance(attempt_policy["revealAfter"], int) or attempt_policy["revealAfter"] < 1:
        raise FlowValidationError(
            f"{source}: step {step['id']} attemptPolicy.revealAfter must be >= 1"
        )
    if not isinstance(attempt_policy["allowSkip"], bool):
        raise FlowValidationError(
            f"{source}: step {step['id']} attemptPolicy.allowSkip must be boolean"
        )

    next_branch = step["next"]
    if not isinstance(next_branch, dict):
        raise FlowValidationError(
            f"{source}: step {step['id']} next must be an object"
        )
    for key in ["correct", "wrong", "skip"]:
        if key not in next_branch:
            continue
        if next_branch[key] is not None and not isinstance(next_branch[key], str):
            raise FlowValidationError(
                f"{source}: step {step['id']} next.{key} must be string or null"
            )


def _require(obj: dict, key: str, source: str, prefix: str = "flow") -> None:
    if key not in obj:
        raise FlowValidationError(f"{source}: {prefix} missing required key {key}")
