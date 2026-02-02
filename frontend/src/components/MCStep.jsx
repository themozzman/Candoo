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
  let cleaned = value
    .replace(/\bfrom(?=[0-9(\\∞])/gi, "from ")
    .replace(/\bto(?=[0-9(\\∞])/gi, "to ")
    .replace(/\bof(?=\()/gi, "of ");
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
  if (option && typeof option === "object") {
    const text = option.text || "";
    const math = option.math || "";
    const safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const parts = [];
    if (safeText) {
      parts.push(`<span>${safeText}</span>`);
    }
    if (math) {
      parts.push(
        katex.renderToString(math, {
          throwOnError: false,
          strict: false,
          output: "html"
        })
      );
    }
    return { __html: parts.join(" ") };
  }
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
      <MathPrompt
        prompt={step.prompt}
        promptText={step.prompt_text || step.promptText}
        promptMath={step.prompt_math || step.promptMath}
      />
      <div className="step-options">
        {step.options.map((option) => {
          const optionValue =
            option && typeof option === "object" ? option.value : option;
          const optionKey =
            option && typeof option === "object" ? option.value : option;
          return (
          <button
            key={optionKey}
            className="option-button"
            onClick={() => onAnswer(optionValue)}
            disabled={disabled || hideSubmit}
          >
            {option && typeof option === "object"
              ? (
                <span dangerouslySetInnerHTML={renderOptionContent(option)} />
              )
              : MATH_TRIGGER.test(String(option ?? "")) ? (
              <span dangerouslySetInnerHTML={renderOptionContent(option)} />
            ) : (
              optionValue
            )}
          </button>
          );
        })}
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
