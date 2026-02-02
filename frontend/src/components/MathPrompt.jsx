import React, { useMemo } from "react";
import katex from "katex";

export default function MathPrompt({ prompt, promptText, promptMath }) {
  const hasStructured = Boolean(promptText || promptMath);
  const fallbackPrompt = (prompt ?? "").trim();

  const mathMarkup = useMemo(() => {
    if (!promptMath) {
      return "";
    }
    return katex.renderToString(promptMath, {
      throwOnError: false,
      strict: false,
      output: "html"
    });
  }, [promptMath]);

  if (!hasStructured && !fallbackPrompt) {
    return null;
  }

  return (
    <div className="step-prompt">
      {hasStructured ? (
        <>
          {promptText && <div className="step-prompt-text">{promptText}</div>}
          {mathMarkup && (
            <div
              className="step-prompt-math"
              dangerouslySetInnerHTML={{ __html: mathMarkup }}
            />
          )}
        </>
      ) : (
        <div className="step-prompt-text">{fallbackPrompt}</div>
      )}
    </div>
  );
}
