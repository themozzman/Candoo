import React from "react";

export default function MCStep({ step, onAnswer, onSkip }) {
  return (
    <div>
      <div>{step.prompt}</div>
      <div>
        {step.options.map((option) => (
          <button key={option} onClick={() => onAnswer(option)}>
            {option}
          </button>
        ))}
      </div>
      <div>
        <button onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}
