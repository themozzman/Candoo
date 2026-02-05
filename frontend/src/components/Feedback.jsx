import React, { useMemo } from "react";
import katex from "katex";

export default function Feedback({
  result,
  solution,
  analysisLoading = false,
  showAttemptAnalysis = false
}) {
  if (!result || result.skipped) {
    return null;
  }

  if (result.recorded) {
    return (
      <div className="feedback feedback-neutral">
        <div className="feedback-text">{result.feedback || "Response recorded."}</div>
      </div>
    );
  }

  const solutionSteps = useMemo(() => {
    if (!result.reveal) {
      return [];
    }
    if (solution?.steps && Array.isArray(solution.steps)) {
      return solution.steps;
    }
    if (result.correctAnswer) {
      return [{ text: "Correct answer", math: result.correctAnswer }];
    }
    return [];
  }, [solution, result]);

  const correctionHelp = Array.isArray(result.correctionHelp)
    ? result.correctionHelp
    : [];

  const renderMath = (math) => {
    if (!math) {
      return "";
    }
    return katex.renderToString(math, {
      throwOnError: false,
      strict: false,
      output: "html"
    });
  };

  return (
    <div className={`feedback ${result.correct ? "feedback-good" : "feedback-bad"}`}>
      <div className="feedback-text">{result.feedback}</div>
      {solutionSteps.length > 0 && (
        <div className="feedback-solution">
          <div className="feedback-section-title">How to get the correct answer</div>
          <div className="feedback-solution-steps">
            {solutionSteps.map((step, index) => (
              <div key={`solution-step-${index}`} className="feedback-solution-step">
                {step.text && <div className="feedback-solution-text">{step.text}</div>}
                {step.math && (
                  <div
                    className="feedback-solution-math"
                    dangerouslySetInnerHTML={{ __html: renderMath(step.math) }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {showAttemptAnalysis && analysisLoading && (
        <div className="feedback-loading">
          <span className="feedback-spinner" />
          Analyzing your attempts…
        </div>
      )}
      {showAttemptAnalysis && result.reveal && correctionHelp.length > 0 && (
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
