from typing import Iterable


def normalize_value(value: str, ops: Iterable[str]) -> str:
    result = value or ""
    for op in ops:
        if op == "trim":
            result = result.strip()
        elif op == "lowercase":
            result = result.lower()
        elif op == "remove_spaces":
            result = result.replace(" ", "")
    return result


def grade_mc(response: str, answer_value: str) -> bool:
    return response == answer_value


def grade_sa(response: str, accepted_values: Iterable[str], normalize_ops: Iterable[str]) -> bool:
    normalized_response = normalize_value(response, normalize_ops)
    normalized_set = {normalize_value(value, normalize_ops) for value in accepted_values}
    return normalized_response in normalized_set
