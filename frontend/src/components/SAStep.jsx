import React, { useState } from "react";

export default function SAStep({ step, onAnswer, onSkip }) {
  const [value, setValue] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    onAnswer(value);
  };

  return (
    <form className="step" onSubmit={handleSubmit}>
      <div className="step-prompt">{step.prompt}</div>
      <input
        className="step-input"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="step-actions">
        <button className="button-primary" type="submit">
          Submit
        </button>
        <button className="button-secondary" type="button" onClick={onSkip}>
          Skip
        </button>
      </div>
    </form>
  );
}
