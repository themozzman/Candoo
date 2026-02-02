import React from "react";
import katex from "katex";
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
          const optionText =
            option && typeof option === "object" ? option.text || "" : "";
          const optionMath =
            option && typeof option === "object" ? option.math || "" : "";
          const mathMarkup = optionMath
            ? katex.renderToString(optionMath, {
                throwOnError: false,
                strict: false,
                output: "html"
              })
            : "";
          return (
          <button
            key={optionKey}
            className="option-button"
            onClick={() => onAnswer(optionValue)}
            disabled={disabled || hideSubmit}
          >
            {option && typeof option === "object" ? (
              <>
                {optionText && <div className="option-text">{optionText}</div>}
                {mathMarkup && (
                  <div
                    className="option-math"
                    dangerouslySetInnerHTML={{ __html: mathMarkup }}
                  />
                )}
                {!optionText && !mathMarkup && (option.value || "")}
              </>
            ) : (
              optionValue
            )}
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
