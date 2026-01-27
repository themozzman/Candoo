import React from "react";

export default function Feedback({ result }) {
  if (!result) {
    return null;
  }

  return (
    <div className={`feedback ${result.correct ? "feedback-good" : "feedback-bad"}`}>
      <div className="feedback-text">{result.feedback}</div>
      {result.reveal && result.correctAnswer && (
        <div className="feedback-answer">
          Correct answer: {result.correctAnswer}
        </div>
      )}
      <div className="feedback-status">
        {result.correct ? "Correct" : "Try again"}
      </div>
    </div>
  );
}
