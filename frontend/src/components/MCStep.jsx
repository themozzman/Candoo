import React from "react";
import katex from "katex";
import MathPrompt from "./MathPrompt.jsx";

const MATH_TRIGGER =
  /[=\^*]|\\|∫|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root)\b|\bpi\b|π|\b[a-zA-Z]\s*\(/i;
const MATH_TOKEN =
  /[0-9^*=\\()[\]{}]|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root|pi)\b|π/i;

function escapeTextToken(value) {
  return value.replace(/\\/g, "\\textbackslash ").replace(/[{}]/g, "\\$&");
}

function normalizeMathToken(value) {
  return value.replace(/\*/g, "\\cdot ");
}

function normalizeIntegralText(value) {
  if (!value) {
    return "";
  }
  let cleaned = value;
  cleaned = cleaned.replace(/\^\(([^)]+)\)/g, "^{$1}");
  cleaned = cleaned.replace(
    /∫\s*from\s*([^\s]+)\s*to\s*(∞|\\infty)\s*of\s*\(([^)]+)\)\s*dx\b[?.,!]?/i,
    "\\int_{$1}^{$2} $3 \\, dx"
  );
  cleaned = cleaned.replace(
    /∫\s*from\s*([^\s]+)\s*to\s*(∞|\\infty)\s*of\s*([^?]+?)\s*dx\b[?.,!]?/i,
    "\\int_{$1}^{$2} $3 \\, dx"
  );
  cleaned = cleaned.replace(/∞/g, "\\infty");
  return cleaned;
}

function renderOptionContent(option) {
  const raw = String(option ?? "").trim();
  if (!raw || !MATH_TRIGGER.test(raw)) {
    return { __html: "" };
  }
  if (/∫\s*from\s+/i.test(raw)) {
    return {
      __html: katex.renderToString(normalizeIntegralText(raw), {
        throwOnError: false,
        strict: false,
        output: "html"
      })
    };
  }
  if (raw.includes("\\") || raw.includes("{") || raw.includes("}")) {
    return {
      __html: katex.renderToString(raw, {
        throwOnError: false,
        strict: false,
        output: "html"
      })
    };
  }
  const latex = raw
    .split(/\s+/)
    .map((token) =>
      MATH_TOKEN.test(token)
        ? normalizeMathToken(token)
        : `\\text{${escapeTextToken(token)}}`
    )
    .join("\\ ");
  return {
    __html: katex.renderToString(latex, {
      throwOnError: false,
      strict: false,
      output: "html"
    })
  };
}

export default function MCStep({
  step,
  onAnswer,
  onSkip,
  disabled = false,
  hideSkip = false,
  hideSubmit = false
}) {
  return (
    <div className="step">
      <MathPrompt prompt={step.prompt} />
      <div className="step-options">
        {step.options.map((option) => (
          <button
            key={option}
            className="option-button"
            onClick={() => onAnswer(option)}
            disabled={disabled || hideSubmit}
          >
            {MATH_TRIGGER.test(String(option ?? "")) ? (
              <span dangerouslySetInnerHTML={renderOptionContent(option)} />
            ) : (
              option
            )}
          </button>
        ))}
      </div>
      <div className="step-actions">
        {!hideSkip && (
          <button className="button-secondary" onClick={onSkip} disabled={disabled}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
