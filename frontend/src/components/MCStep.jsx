import React from "react";
import MathPrompt from "./MathPrompt.jsx";

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
      <MathPrompt prompt={step.prompt} promptText={step.prompt_text} promptMath={step.prompt_math} />
      <div className="step-options">
        {step.options.map((option) => {
          const optionValue =
            option && typeof option === "object" ? option.value : option;
          const optionKey =
            option && typeof option === "object" ? option.value : option;
          const optionLabel =
            option && typeof option === "object"
              ? option.text || option.math || option.value || ""
              : optionValue;
          return (
          <button
            key={optionKey}
            className="option-button"
            onClick={() => onAnswer(optionValue)}
            disabled={disabled || hideSubmit}
          >
            {optionLabel}
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
