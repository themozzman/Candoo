import re
from typing import Iterable, Optional

from sympy import (
    Abs,
    E,
    Integral,
    Symbol,
    acos,
    asin,
    atan,
    csc,
    cos,
    cot,
    log,
    pi,
    root,
    sec,
    sin,
    sqrt,
    tan,
)
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)
from sympy.simplify import simplify
from sympy.core.sympify import SympifyError


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


_MATH_LOCAL_DICT = {
    "sin": sin,
    "cos": cos,
    "tan": tan,
    "sec": sec,
    "csc": csc,
    "cot": cot,
    "arcsin": asin,
    "arccos": acos,
    "arctan": atan,
    "asin": asin,
    "acos": acos,
    "atan": atan,
    "log": log,
    "ln": log,
    "sqrt": sqrt,
    "root": root,
    "Abs": Abs,
    "E": E,
    "pi": pi,
    "Integral": Integral,
    "C": Symbol("C"),
}
_MATH_TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def _normalize_for_sympy(value: str) -> str:
    if not value:
        return ""
    result = value
    result = result.replace("−", "-")
    result = result.replace("×", "*").replace("·", "*")
    result = result.replace("÷", "/")
    result = result.replace("π", "pi")
    result = result.replace("√", "sqrt")
    result = re.sub(r"\s+", " ", result.strip())
    result = re.sub(
        r"∫\s*(.+?)\s*d([a-zA-Z])",
        r"Integral(\1, \2)",
        result,
    )
    return result


def _parse_math_expression(value: str) -> Optional[object]:
    normalized = _normalize_for_sympy(value)
    if not normalized:
        return None
    try:
        return parse_expr(
            normalized,
            local_dict=_MATH_LOCAL_DICT,
            transformations=_MATH_TRANSFORMS,
            evaluate=True,
        )
    except (SympifyError, SyntaxError, TypeError, ValueError):
        return None


def _expressions_equivalent(left: object, right: object) -> bool:
    try:
        return simplify(left - right) == 0
    except (TypeError, ValueError):
        return False


def grade_mc(response: str, answer_value: str) -> bool:
    return response == answer_value


def grade_sa(response: str, accepted_values: Iterable[str], normalize_ops: Iterable[str]) -> bool:
    normalized_response = normalize_value(response, normalize_ops)
    normalized_set = {normalize_value(value, normalize_ops) for value in accepted_values}
    if normalized_response in normalized_set:
        return True

    response_expr = _parse_math_expression(response)
    if response_expr is None:
        return False

    for value in accepted_values:
        value_expr = _parse_math_expression(value)
        if value_expr is None:
            continue
        if _expressions_equivalent(response_expr, value_expr):
            return True

    return False
