import React, { useEffect, useRef, useState } from "react";
import MathPrompt from "./MathPrompt.jsx";

const KEYBOARD_TABS = [
  {
    id: "basic",
    label: "Basic",
    keys: [
      { label: "7", value: "7" },
      { label: "8", value: "8" },
      { label: "9", value: "9" },
      { label: "÷", value: "/" },
      { label: "4", value: "4" },
      { label: "5", value: "5" },
      { label: "6", value: "6" },
      { label: "×", value: "*" },
      { label: "1", value: "1" },
      { label: "2", value: "2" },
      { label: "3", value: "3" },
      { label: "−", value: "-" },
      { label: "0", value: "0" },
      { label: ".", value: "." },
      { label: "=", value: "=" },
      { label: "+", value: "+" },
      { label: "(", value: "(" },
      { label: ")", value: ")" },
      { label: "^", value: "^" },
      { label: "x", value: "x" },
      { label: "y", value: "y" },
      { label: "π", value: "pi" },
      { label: "√", value: "sqrt(" }
    ]
  },
  {
    id: "calc",
    label: "Calc",
    keys: [
      { label: "d/dx", value: "Derivative(" },
      { label: "∫", value: "Integral(" },
      { label: "lim", value: "limit(" },
      { label: "∞", value: "oo" },
      { label: "θ", value: "theta" },
      { label: "log", value: "log(" },
      { label: "ln", value: "ln(" },
      { label: "root", value: "root(" },
      { label: "|x|", value: "abs(" },
      { label: "f(x)", value: "f(x)" },
      { label: "g(x)", value: "g(x)" },
      { label: "h(x)", value: "h(x)" }
    ]
  },
  {
    id: "trig",
    label: "sin cos",
    keys: [
      { label: "sin", value: "sin(" },
      { label: "cos", value: "cos(" },
      { label: "tan", value: "tan(" },
      { label: "csc", value: "csc(" },
      { label: "sec", value: "sec(" },
      { label: "cot", value: "cot(" },
      { label: "arcsin", value: "arcsin(" },
      { label: "arccos", value: "arccos(" },
      { label: "arctan", value: "arctan(" }
    ]
  },
  {
    id: "symbols",
    label: "Σ ∫ Π",
    keys: [
      { label: "≤", value: "<=" },
      { label: "≥", value: ">=" },
      { label: "≠", value: "!=" },
      { label: "≈", value: "~" },
      { label: "°", value: "deg" },
      { label: "⋅", value: "*" },
      { label: "÷", value: "/" },
      { label: "→", value: "->" },
      { label: "∑", value: "Sum(" },
      { label: "∏", value: "Product(" },
      { label: "π", value: "pi" },
      { label: "e", value: "e" }
    ]
  }
];

export default function SAStep({
  step,
  onAnswer,
  onSkip,
  showMathKeyboard = false,
  disabled = false,
  revealedAnswer = ""
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (revealedAnswer) {
      setValue(revealedAnswer);
    }
  }, [revealedAnswer]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const inputRef = useRef(null);
  const isSpotError = /identify the error/i.test(step.prompt || "");

  const getSelection = () => {
    const input = inputRef.current;
    const fallback = value.length;
    return {
      start: input?.selectionStart ?? fallback,
      end: input?.selectionEnd ?? fallback
    };
  };

  const updateValue = (nextValue, caretPosition) => {
    setValue(nextValue);
    if (!inputRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current.focus();
      if (typeof caretPosition === "number") {
        inputRef.current.setSelectionRange(caretPosition, caretPosition);
      }
    });
  };

  const insertText = (text) => {
    const { start, end } = getSelection();
    const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
    updateValue(nextValue, start + text.length);
  };

  const backspace = () => {
    const { start, end } = getSelection();
    if (start !== end) {
      const nextValue = `${value.slice(0, start)}${value.slice(end)}`;
      updateValue(nextValue, start);
      return;
    }
    if (start === 0) {
      return;
    }
    const nextValue = `${value.slice(0, start - 1)}${value.slice(end)}`;
    updateValue(nextValue, start - 1);
  };

  const clearValue = () => {
    updateValue("", 0);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onAnswer(value);
  };

  const activeKeys =
    KEYBOARD_TABS.find((tab) => tab.id === activeTab)?.keys || [];

  return (
    <form className="step" onSubmit={handleSubmit}>
      <MathPrompt prompt={step.prompt} />
      {isSpotError && (
        <div className="step-hint">
          Enter the fully corrected answer, not just the error.
        </div>
      )}
      <input
        className={`step-input${revealedAnswer ? " step-input-reveal" : ""}`}
        type="text"
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setKeyboardOpen(true)}
        disabled={disabled}
        placeholder={
          isSpotError ? "e.g., f'(x)=2x sin(x) + x^2 cos(x)" : undefined
        }
      />
      {showMathKeyboard && (
        <>
          <div className="math-keyboard-toggle-row">
            <button
              type="button"
              className="math-keyboard-toggle-button"
              onClick={() => setKeyboardOpen((prev) => !prev)}
              disabled={disabled}
            >
              {keyboardOpen ? "Hide keyboard" : "Show keyboard"}
            </button>
          </div>
          {keyboardOpen && (
            <div className="math-keyboard compact">
              <div className="math-keyboard-tabs">
                {KEYBOARD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`math-keyboard-tab ${
                      activeTab === tab.id ? "active" : ""
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                    disabled={disabled}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="math-keyboard-grid compact">
                {activeKeys.map((key) => (
                  <button
                    key={`${activeTab}-${key.label}`}
                    type="button"
                    className="math-keyboard-key compact"
                    onClick={() => insertText(key.value)}
                    disabled={disabled}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
              <div className="math-keyboard-actions compact">
                <button
                  type="button"
                  className="math-keyboard-action"
                  onClick={backspace}
                  disabled={disabled}
                >
                  ⌫
                </button>
                <button
                  type="button"
                  className="math-keyboard-action"
                  onClick={clearValue}
                  disabled={disabled}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <div className="step-actions">
        <button className="button-primary" type="submit" disabled={disabled}>
          Submit
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={onSkip}
          disabled={disabled}
        >
          Skip
        </button>
      </div>
    </form>
  );
}
