import React from "react";

export default function Feedback({ result }) {
  if (!result) {
    return null;
  }

  const correctionHelp = Array.isArray(result.correctionHelp)
    ? result.correctionHelp
    : [];

  return (
    <div className={`feedback ${result.correct ? "feedback-good" : "feedback-bad"}`}>
      <div className="feedback-text">{result.feedback}</div>
      {result.reveal && correctionHelp.length > 0 && (
        <div className="feedback-detail">
          {correctionHelp.map((attempt) => (
            <div
              key={`attempt-${attempt.attempt_number}`}
              className="feedback-attempt"
            >
              <div className="feedback-attempt-title">
                Attempt {attempt.attempt_number}
              </div>
              <div className="feedback-attempt-answer">
                Your answer: {attempt.response}
              </div>
              {attempt.steps?.length > 0 && (
                <div className="feedback-section">
                  <div className="feedback-section-title">
                    How to get the correct answer
                  </div>
                  <ol className="feedback-steps">
                    {attempt.steps.map((step, index) => (
                      <li key={`${attempt.attempt_number}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {attempt.why_wrong && (
                <div className="feedback-section">
                  <div className="feedback-section-title">
                    Why this is wrong
                  </div>
                  <div className="feedback-why">{attempt.why_wrong}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="feedback-status">
        {result.correct ? "Correct" : "Try again"}
      </div>
    </div>
  );
}
