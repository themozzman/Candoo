import logging
import re
from typing import Iterable, Optional

from sympy import (
    Abs,
    E,
    Integral,
    Symbol,
    diff,
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

logger = logging.getLogger(__name__)

MAX_RESPONSE_LEN = 280
MAX_OPERATOR_COUNT = 120
VALID_CHAR_PATTERN = re.compile(r"^[0-9a-zA-Z\s\.\+\-\*\/\^\(\)\[\],|_=<>%√π∫·×÷−]+$")
MATH_HINT_PATTERN = re.compile(
    r"[0-9]|[+\-*/^]|sqrt|root|sin|cos|tan|sec|csc|cot|log|ln|pi|π|∫|d/d|derivative",
    re.IGNORECASE,
)


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
    "E": E,
}
_MATH_TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def _normalize_for_sympy(value: str) -> str:
    if not value:
        return ""
    result = value.strip()
    if "=" in result:
        result = result.split("=")[-1].strip()
    result = re.sub(
        r"^\s*[a-zA-Z]\s*['′]?\s*\(\s*[a-zA-Z]\s*\)\s*",
        "",
        result,
    )
    result = re.sub(r"^\s*[a-zA-Z]\s*['′]?\s*=\s*", "", result)
    result = result.replace("−", "-")
    result = result.replace("×", "*").replace("·", "*")
    result = result.replace("÷", "/")
    result = result.replace("π", "pi")
    result = result.replace("√", "sqrt")
    result = re.sub(r"\s+", " ", result.strip())
    result = re.sub(
        r"\b(sin|cos|tan|sec|csc|cot|ln|log)([a-zA-Z])\b",
        r"\1(\2)",
        result,
    )
    result = re.sub(
        r"\b(sin|cos|tan|sec|csc|cot)([a-zA-Z])\^",
        r"\1(\2)^",
        result,
    )
    result = re.sub(
        r"∫\s*(.+?)\s*d([a-zA-Z])",
        r"Integral(\1, \2)",
        result,
    )
    result = re.sub(
        r"\bint\s*(.+?)\s*d([a-zA-Z])",
        r"Integral(\1, \2)",
        result,
        flags=re.IGNORECASE,
    )
    result = re.sub(
        r"d/d([a-zA-Z])\s*\((.+?)\)",
        r"Derivative(\2, \1)",
        result,
    )
    result = re.sub(
        r"d/d([a-zA-Z])\s*([a-zA-Z0-9_]+)",
        r"Derivative(\2, \1)",
        result,
    )
    return result


def _build_local_dict(use_symbol_e: bool) -> dict:
    local_dict = dict(_MATH_LOCAL_DICT)
    if use_symbol_e:
        local_dict["e"] = Symbol("e")
    else:
        local_dict["e"] = E
    return local_dict


def _parse_math_expressions(value: str) -> list[object]:
    normalized = _normalize_for_sympy(value)
    if not normalized:
        return []
    variants: list[object] = []
    use_symbol_e_variants = [False]
    if re.search(r"\be\b", normalized):
        use_symbol_e_variants.append(True)
    try:
        for use_symbol_e in use_symbol_e_variants:
            expr = parse_expr(
                normalized,
                local_dict=_build_local_dict(use_symbol_e),
                transformations=_MATH_TRANSFORMS,
                evaluate=True,
            )
            variants.append(expr)
    except (SympifyError, SyntaxError, TypeError, ValueError):
        return []
    return variants


def _looks_like_math(values: Iterable[str]) -> bool:
    for value in values:
        if value and MATH_HINT_PATTERN.search(value):
            return True
    return False


def _mentions_constant(value: str) -> bool:
    if not value:
        return False
    return bool(re.search(r"\bC\b|\+C|\-C|constant", value))


def _expressions_equivalent(left: object, right: object, allow_constant_shift: bool) -> bool:
    try:
        diff = simplify(left - right)
    except (TypeError, ValueError):
        return False
    if diff == 0:
        return True
    if allow_constant_shift:
        free_symbols = diff.free_symbols
        if not free_symbols:
            return True
        if free_symbols.issubset({Symbol("C")}):
            return True
    return False


def grade_mc(response: str, answer_value: str) -> bool:
    return response == answer_value


def grade_sa(response: str, accepted_values: Iterable[str], normalize_ops: Iterable[str]) -> bool:
    correct, _ = grade_sa_detail(response, accepted_values, normalize_ops)
    return correct


def grade_sa_detail(
    response: str, accepted_values: Iterable[str], normalize_ops: Iterable[str]
) -> tuple[bool, Optional[str]]:
    normalized_response = normalize_value(response, normalize_ops)
    normalized_set = {normalize_value(value, normalize_ops) for value in accepted_values}
    if normalized_response in normalized_set:
        return True, None

    if not _looks_like_math(accepted_values) and not _looks_like_math([response]):
        return False, None

    if len(response) > MAX_RESPONSE_LEN:
        logger.info("SA response too long", extra={"length": len(response)})
        return False, "too_long"

    if not VALID_CHAR_PATTERN.match(response or ""):
        logger.info("SA response has invalid characters")
        return False, "invalid_chars"

    operator_count = len(re.findall(r"[+\-*/^]", response))
    if operator_count > MAX_OPERATOR_COUNT:
        logger.info("SA response too complex", extra={"operators": operator_count})
        return False, "too_complex"

    response_exprs = _parse_math_expressions(response)
    if not response_exprs:
        logger.info("SA response parse error")
        return False, "parse_error"

    allow_constant_shift = any(
        _mentions_constant(value) for value in accepted_values
    ) or _mentions_constant(response)

    for value in accepted_values:
        value_exprs = _parse_math_expressions(value)
        if not value_exprs:
            continue
        for response_expr in response_exprs:
            for value_expr in value_exprs:
                if _expressions_equivalent(response_expr, value_expr, allow_constant_shift):
                    return True, None

    return False, None


def grade_sa_derivative(
    response: str, base_expression: str, normalize_ops: Iterable[str]
) -> tuple[bool, Optional[str]]:
    normalized_response = normalize_value(response, normalize_ops)
    if not normalized_response:
        return False, None

    if len(response) > MAX_RESPONSE_LEN:
        logger.info("SA response too long", extra={"length": len(response)})
        return False, "too_long"

    if not VALID_CHAR_PATTERN.match(response or ""):
        logger.info("SA response has invalid characters")
        return False, "invalid_chars"

    operator_count = len(re.findall(r"[+\-*/^]", response))
    if operator_count > MAX_OPERATOR_COUNT:
        logger.info("SA response too complex", extra={"operators": operator_count})
        return False, "too_complex"

    response_exprs = _parse_math_expressions(response)
    if not response_exprs:
        logger.info("SA response parse error")
        return False, "parse_error"

    base_exprs = _parse_math_expressions(base_expression)
    if not base_exprs:
        logger.info("Base expression parse error")
        return False, "parse_error"

    derivative_exprs: list[object] = []
    for base_expr in base_exprs:
        symbols = sorted(base_expr.free_symbols, key=lambda sym: sym.name)
        if not symbols:
            derivative_exprs.append(diff(base_expr))
            continue
        preferred = next((sym for sym in symbols if sym.name == "x"), None)
        variable = preferred or symbols[0]
        derivative_exprs.append(diff(base_expr, variable))

    for response_expr in response_exprs:
        for derivative_expr in derivative_exprs:
            if _expressions_equivalent(response_expr, derivative_expr, False):
                return True, None

    return False, None
