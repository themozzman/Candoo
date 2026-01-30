from engine.grading import grade_sa_detail


def assert_correct(response, accepted, normalize=None):
    correct, reason = grade_sa_detail(response, accepted, normalize or [])
    assert correct, f"Expected correct, got reason={reason}"


def assert_incorrect(response, accepted, normalize=None, reason=None):
    correct, got_reason = grade_sa_detail(response, accepted, normalize or [])
    assert not correct
    if reason is not None:
        assert got_reason == reason


def test_implicit_multiplication():
    assert_correct("2x", ["2*x"])


def test_trig_identity():
    assert_correct("1/cos^2(x)", ["sec(x)^2"])


def test_log_ln_equivalence():
    assert_correct("ln(x)", ["log(x)"])


def test_root_equivalence():
    assert_correct("root(9, 2)", ["3"])


def test_constant_of_integration_allowed():
    accepted = ["-(3/20)u^(4/3) + C"]
    assert_correct("-(3/20)u^(4/3)", accepted)


def test_non_math_answer_uses_normalization():
    assert_correct("paris", ["Paris"], normalize=["trim", "lowercase"])


def test_non_math_incorrect_no_parse_error():
    correct, reason = grade_sa_detail("London", ["Paris"], ["trim", "lowercase"])
    assert not correct
    assert reason is None


def test_invalid_chars_rejected():
    assert_incorrect("2x @ 3", ["2*x"], reason="invalid_chars")


def test_too_long_rejected():
    assert_incorrect("x" * 400, ["x"], reason="too_long")
