import React from "react";

export default function MCStep({ step, onAnswer, onSkip }) {
  return (
    <div className="step">
      <div className="step-prompt">{step.prompt}</div>
      <div className="step-options">
        {step.options.map((option) => (
          <button
            key={option}
            className="option-button"
            onClick={() => onAnswer(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="step-actions">
        <button className="button-secondary" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
