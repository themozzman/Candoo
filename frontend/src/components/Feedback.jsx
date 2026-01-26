import React from "react";

export default function Feedback({ result }) {
  if (!result) {
    return null;
  }

  return (
    <div>
      <div>{result.feedback}</div>
      {result.reveal && result.correctAnswer && (
        <div>Correct answer: {result.correctAnswer}</div>
      )}
      <div>{result.correct ? "Correct" : "Try again"}</div>
    </div>
  );
}
