import React, { useMemo } from "react";
import katex from "katex";

const MATH_TRIGGER =
  /[=\^]|\\|∫|\b(sin|cos|tan|sec|csc|cot|log|ln|sqrt|root)\b|\bpi\b|π|\b[a-zA-Z]\s*\(/i;

const TAIL_KEYWORDS =
  /\s+(to|and|then|so|where|with|for|if|when|find|given|assuming|converges|diverges)\b/i;

function adjustMathStart(raw, start) {
  if (start <= 0 || raw[start] !== "^") {
    return start;
  }
  let idx = start - 1;
  while (idx >= 0 && /\s/.test(raw[idx])) {
    idx -= 1;
  }
  while (idx >= 0 && !/\s/.test(raw[idx])) {
    idx -= 1;
  }
  return idx + 1;
}

function splitMathTail(rawMath) {
  if (!rawMath) {
    return { math: "", tail: "" };
  }
  const candidates = [];
  const keywordMatch = rawMath.match(TAIL_KEYWORDS);
  if (keywordMatch) {
    candidates.push({
      index: keywordMatch.index ?? -1,
      tailStart: keywordMatch.index ?? -1
    });
  }
  const parenKeywordMatch = rawMath.match(/\)\s*(converges|diverges)\b/i);
  if (parenKeywordMatch) {
    const idx = parenKeywordMatch.index ?? -1;
    candidates.push({
      index: idx,
      tailStart: idx + 1
    });
  }
  const punctuationMatch = rawMath.match(/[,;]\s+/);
  if (punctuationMatch) {
    candidates.push({
      index: punctuationMatch.index ?? -1,
      tailStart: (punctuationMatch.index ?? 0) + 1
    });
  }
  const validCandidates = candidates.filter((candidate) => candidate.index > 0);
  if (validCandidates.length === 0) {
    return { math: rawMath, tail: "" };
  }
  validCandidates.sort((a, b) => a.index - b.index);
  const { index, tailStart } = validCandidates[0];
  const math = rawMath.slice(0, index).trim();
  const tail = rawMath.slice(tailStart).trim();
  if (!math || !tail || MATH_TRIGGER.test(tail)) {
    return { math: rawMath, tail: "" };
  }
  return { math, tail };
}

function stripLeadingParen(rawMath) {
  if (!rawMath) {
    return { math: "", leadingText: "" };
  }
  const trimmed = rawMath.trimStart();
  if (trimmed.startsWith("(")) {
    let math = trimmed.slice(1).trimStart();
    if (math.endsWith(")")) {
      math = math.slice(0, -1).trimEnd();
    }
    return { math, leadingText: "(" };
  }
  return { math: rawMath, leadingText: "" };
}

function splitPrompt(prompt) {
  if (!prompt) {
    return { text: "", math: "", tail: "" };
  }
  const usingMatch = prompt.match(/\s+using\s+/i);
  if (usingMatch) {
    const usingIdx = prompt.toLowerCase().indexOf(" using ");
    const beforeUsing = prompt.slice(0, usingIdx).trim();
    const usingClause = prompt.slice(usingIdx + 7).trim();
    if (usingClause) {
      let mathStart = beforeUsing.search(MATH_TRIGGER);
      mathStart = adjustMathStart(beforeUsing, mathStart);
      if (mathStart >= 0) {
        const instruction = beforeUsing.slice(0, mathStart).trim().replace(/[:\s]+$/, "");
        const mathCandidate = beforeUsing.slice(mathStart).trim();
        const { math: strippedMath, leadingText } = stripLeadingParen(mathCandidate);
        const { math, tail } = splitMathTail(strippedMath);
        if (math) {
          return {
            text: instruction
              ? `${instruction} using ${usingClause}`
              : `Using ${usingClause}`,
            math,
            tail,
            prefix: leadingText
          };
        }
      }
    }
  }
  if (prompt.includes(":")) {
    const [text, ...rest] = prompt.split(":");
    const remainder = rest.join(":").trim();
    if (remainder && MATH_TRIGGER.test(remainder)) {
      const { math: strippedMath, leadingText } = stripLeadingParen(remainder);
      const { math, tail } = splitMathTail(strippedMath);
      return { text: `${text}:`, math, tail, prefix: leadingText };
    }
  }
  if (!MATH_TRIGGER.test(prompt)) {
    return { text: prompt, math: "", tail: "", prefix: "" };
  }
  let mathStart = prompt.search(MATH_TRIGGER);
  mathStart = adjustMathStart(prompt, mathStart);
  if (mathStart === 0) {
    const { math: strippedMath, leadingText } = stripLeadingParen(prompt);
    const { math, tail } = splitMathTail(strippedMath);
    return { text: "", math, tail, prefix: leadingText };
  }
  if (mathStart < 0) {
    return { text: prompt, math: "", tail: "", prefix: "" };
  }
  const text = prompt.slice(0, mathStart).trim();
  const mathCandidate = prompt.slice(mathStart).trim();
  const { math: strippedMath, leadingText } = stripLeadingParen(mathCandidate);
  const { math, tail } = splitMathTail(strippedMath);
  return {
    text: text ? `${text}` : "",
    math,
    tail,
    prefix: leadingText
  };
}

function normalizeMathText(rawMath) {
  if (!rawMath) {
    return "";
  }
  let cleaned = rawMath.replace(/[.?!,]+$/g, "");
  cleaned = cleaned
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
  cleaned = cleaned.replace(/\s+and\s+/gi, ", ");
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

export default function MathPrompt({ prompt }) {
  const { text, math, tail, prefix } = useMemo(() => splitPrompt(prompt), [prompt]);
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
      {text && (
        <div className="step-prompt-text">
          {text}
          {prefix && ` ${prefix}`}
        </div>
      )}
      {mathMarkup && (
        <div
          className="step-prompt-math"
          dangerouslySetInnerHTML={{ __html: mathMarkup }}
        />
      )}
      {tail && <div className="step-prompt-text">{tail}</div>}
      {!text && !mathMarkup && prompt}
    </div>
  );
}
