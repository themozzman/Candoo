import React, { useEffect, useRef } from "react";
import "mathlive";
import MathPrompt from "./MathPrompt.jsx";

export default function SAStep({
  step,
  onAnswer,
  onSkip,
  showMathKeyboard = false,
  disabled = false,
  forceHideKeyboard = false,
  hideSkip = false,
  hideSubmit = false
}) {
  const mathfieldRef = useRef(null);
  const hideSubmitRef = useRef(hideSubmit);
  const isSpotError = /identify the error/i.test(step.prompt || "");
  const keyboardEnabled = showMathKeyboard && !forceHideKeyboard;

  useEffect(() => {
    hideSubmitRef.current = hideSubmit;
  }, [hideSubmit]);

  useEffect(() => {
    const mathfield = mathfieldRef.current;
    if (!mathfield) {
      return;
    }
    mathfield.setOptions({
      virtualKeyboardMode: keyboardEnabled ? "onfocus" : "off",
      smartMode: true
    });
    mathfield.readOnly = Boolean(disabled);
  }, [keyboardEnabled, disabled]);

  useEffect(() => {
    const mathfield = mathfieldRef.current;
    if (!mathfield) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Enter" && hideSubmitRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    mathfield.addEventListener("keydown", handleKeyDown);
    return () => {
      mathfield.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const mathfield = mathfieldRef.current;
    if (mathfield) {
      mathfield.value = "";
    }
  }, [step?.id]);

  const normalizeMathInput = (raw) => {
    if (!raw) {
      return raw;
    }
    let normalized = raw;
    normalized = normalized.replace(
      /([A-Za-z0-9\)])([⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]+)/g,
      (_, base, sup) => {
        const exponent = sup
          .split("")
          .map((char) => char || "")
          .join("");
        return `${base}^(${exponent})`;
      }
    );
    normalized = normalized.replace(/∛\(/g, "root(");
    normalized = normalized.replace(/√\[(.+?)\]\((.+)\)/g, "root($2, $1)");
    normalized = normalized.replace(/⁄/g, "/");
    normalized = normalized.replace(/\s*\n\s*[—-]+\s*\n\s*/g, "/");
    normalized = normalized.replace(/√\(/g, "sqrt(");
    normalized = normalized.replace(/∫\[(.+?),(.+?)\]\((.+)\)/g, "Integral($3, (x, $1, $2))");
    normalized = normalized.replace(/∫/g, "Integral(");
    normalized = normalized.replace(/∑/g, "Sum(");
    normalized = normalized.replace(/∏/g, "Product(");
    normalized = normalized.replace(/∂\/∂x/g, "Derivative(");
    normalized = normalized.replace(/d\/dx/g, "Derivative(");
    normalized = normalized.replace(/π/g, "pi");
    normalized = normalized.replace(/θ/g, "theta");
    normalized = normalized.replace(/∞/g, "oo");
    normalized = normalized.replace(/·/g, "*");
    normalized = normalized.replace(/÷/g, "/");
    normalized = normalized.replace(/≥/g, ">=");
    normalized = normalized.replace(/≤/g, "<=");
    normalized = normalized.replace(/\| \|/g, "abs(");
    normalized = normalized.replace(/\|\|/g, "abs(");
    normalized = normalized.replace(/\|/g, "abs(");
    normalized = normalized.replace(/°/g, "deg");
    normalized = normalized.replace(/f∘g/g, "compose(");
    return normalized;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (hideSubmit) {
      return;
    }
    const mathfield = mathfieldRef.current;
    const raw = mathfield?.getValue?.("ascii-math") || "";
    onAnswer(normalizeMathInput(raw));
  };

  return (
    <form className="step" onSubmit={handleSubmit}>
      <MathPrompt
        prompt={step.prompt}
        promptText={step.prompt_text || step.promptText}
        promptMath={step.prompt_math || step.promptMath}
      />
      {isSpotError && (
        <div className="step-hint">
          Enter the fully corrected answer, not just the error.
        </div>
      )}
      <math-field
        ref={mathfieldRef}
        className="step-input mathlive-input"
        placeholder={
          isSpotError ? "e.g., f'(x)=2x sin(x) + x^2 cos(x)" : undefined
        }
      />
      <div className="step-actions">
        {!hideSubmit && (
          <button className="button-primary" type="submit" disabled={disabled}>
            Submit
          </button>
        )}
        {!hideSkip && (
          <button
            className="button-secondary"
            type="button"
            onClick={onSkip}
            disabled={disabled}
          >
            Skip
          </button>
        )}
      </div>
    </form>
  );
}
