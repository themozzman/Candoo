import React from "react";
import MathPrompt from "./MathPrompt.jsx";

export default function MCStep({ step, onAnswer, onSkip, disabled = false }) {
  return (
    <div className="step">
      <MathPrompt prompt={step.prompt} />
      <div className="step-options">
        {step.options.map((option) => (
          <button
            key={option}
            className="option-button"
            onClick={() => onAnswer(option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="step-actions">
        <button className="button-secondary" onClick={onSkip} disabled={disabled}>
          Skip
        </button>
      </div>
    </div>
  );
}
