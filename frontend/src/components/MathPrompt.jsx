import React, { useMemo } from "react";
import katex from "katex";

const MATH_TRIGGER =
  /[=\^]|\\|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root)\b|\bpi\b|π|\b[a-zA-Z]\s*\(/i;

function splitPrompt(prompt) {
  if (!prompt) {
    return { text: "", math: "" };
  }
  const usingMatch = prompt.match(/\s+using\s+/i);
  if (usingMatch) {
    const usingIdx = prompt.toLowerCase().indexOf(" using ");
    const beforeUsing = prompt.slice(0, usingIdx).trim();
    const usingClause = prompt.slice(usingIdx + 7).trim();
    if (usingClause) {
      const mathStart = beforeUsing.search(MATH_TRIGGER);
      if (mathStart >= 0) {
        const instruction = beforeUsing.slice(0, mathStart).trim().replace(/[:\s]+$/, "");
        const math = beforeUsing.slice(mathStart).trim();
        if (math) {
          return {
            text: instruction
              ? `${instruction} using ${usingClause}`
              : `Using ${usingClause}`,
            math
          };
        }
      }
    }
  }
  if (prompt.includes(":")) {
    const [text, ...rest] = prompt.split(":");
    const remainder = rest.join(":").trim();
    if (remainder && MATH_TRIGGER.test(remainder)) {
      return { text: `${text}:`, math: remainder };
    }
  }
  if (!MATH_TRIGGER.test(prompt)) {
    return { text: prompt, math: "" };
  }
  const mathStart = prompt.search(MATH_TRIGGER);
  if (mathStart === 0) {
    return { text: "", math: prompt };
  }
  if (mathStart < 0) {
    return { text: prompt, math: "" };
  }
  const text = prompt.slice(0, mathStart).trim();
  const math = prompt.slice(mathStart).trim();
  return { text: text ? `${text}` : "", math };
}

function normalizeMathText(rawMath) {
  if (!rawMath) {
    return "";
  }
  let cleaned = rawMath.replace(/[.]+$/g, "");
  cleaned = cleaned.replace(/\s+and\s+/gi, ", ");
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

export default function MathPrompt({ prompt }) {
  const { text, math } = useMemo(() => splitPrompt(prompt), [prompt]);
  const mathMarkup = useMemo(() => {
    const cleaned = normalizeMathText(math);
    if (!cleaned) {
      return "";
    }
    return katex.renderToString(cleaned, {
      throwOnError: false,
      strict: false,
      output: "html"
    });
  }, [math]);

  return (
    <div className="step-prompt">
      {text && <div className="step-prompt-text">{text}</div>}
      {mathMarkup && (
        <div
          className="step-prompt-math"
          dangerouslySetInnerHTML={{ __html: mathMarkup }}
        />
      )}
      {!text && !mathMarkup && prompt}
    </div>
  );
}
