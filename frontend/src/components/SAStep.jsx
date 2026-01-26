import React, { useState } from "react";

export default function SAStep({ step, onAnswer, onSkip }) {
  const [value, setValue] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    onAnswer(value);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>{step.prompt}</div>
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit">Submit</button>
      <button type="button" onClick={onSkip}>
        Skip
      </button>
    </form>
  );
}
