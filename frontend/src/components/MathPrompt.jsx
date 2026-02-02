import React from "react";

export default function MathPrompt({ prompt, promptText, promptMath }) {
  const rawPrompt =
    (prompt ?? "") ||
    [promptText, promptMath].filter(Boolean).join(" ").trim();

  if (!rawPrompt) {
    return null;
  }

  return (
    <div className="step-prompt">
      <div className="step-prompt-text">{rawPrompt}</div>
    </div>
  );
}
