import React, { useEffect, useRef, useState } from "react";
import MathPrompt from "./MathPrompt.jsx";

const KEYBOARD_TABS = [
  {
    id: "basic",
    label: "Basic",
    keys: [
      { label: "x²", insert: "x²" },
      { label: "x^", insert: "x^" },
      { label: "√", insert: "√(" },
      { label: "∛", insert: "∛(" },
      { label: "÷", insert: "÷" },
      { label: "log", insert: "log(" },
      { label: "π", insert: "π" },
      { label: "θ", insert: "θ" },
      { label: "∞", insert: "∞" },
      { label: "∫", insert: "∫" },
      { label: "d/dx", insert: "d/dx" },
      { label: "≥", insert: "≥" },
      { label: "≤", insert: "≤" },
      { label: "·", insert: "·" },
      { label: "x°", insert: "°" },
      { label: "( )", insert: "(" },
      { label: "| |", insert: "|" },
      { label: "f∘g", insert: "f∘g" },
      { label: "f(x)", insert: "f(x)" },
      { label: "ln", insert: "ln(" },
      { label: "e^", insert: "e^" },
      { label: "(')", insert: "'" },
      { label: "∂/∂x", insert: "∂/∂x" },
      { label: "∫□", insert: "∫" },
      { label: "lim", insert: "lim(" },
      { label: "∑", insert: "∑" },
      { label: "sin", insert: "sin(" },
      { label: "cos", insert: "cos(" },
      { label: "tan", insert: "tan(" },
      { label: "cot", insert: "cot(" },
      { label: "csc", insert: "csc(" },
      { label: "sec", insert: "sec(" }
    ]
  },
  {
    id: "calc",
    label: "Calc",
    keys: [
      { label: "∫", insert: "∫" },
      { label: "d/dx", insert: "d/dx" },
      { label: "lim", insert: "lim(" },
      { label: "∑", insert: "∑" },
      { label: "∏", insert: "∏" },
      { label: "log", insert: "log(" },
      { label: "ln", insert: "ln(" },
      { label: "root", insert: "root(" },
      { label: "√", insert: "√(" },
      { label: "|x|", insert: "| |" },
      { label: "f(x)", insert: "f(x)" }
    ]
  },
  {
    id: "trig",
    label: "sin cos",
    keys: [
      { label: "sin", insert: "sin(" },
      { label: "cos", insert: "cos(" },
      { label: "tan", insert: "tan(" },
      { label: "csc", insert: "csc(" },
      { label: "sec", insert: "sec(" },
      { label: "cot", insert: "cot(" }
    ]
  }
];

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
  const [value, setValue] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (forceHideKeyboard) {
      setKeyboardOpen(false);
    }
  }, [forceHideKeyboard]);
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

  const getInsertText = (key) => {
    return key.insert ?? key.label ?? "";
  };

  const normalizeMathInput = (raw) => {
    if (!raw) {
      return raw;
    }
    let normalized = raw;
    normalized = normalized.replace(/([A-Za-z0-9\)])²/g, "$1^(2)");
    normalized = normalized.replace(/([A-Za-z0-9\)])³/g, "$1^(3)");
    normalized = normalized.replace(/∛\(/g, "root(");
    normalized = normalized.replace(/√\(/g, "sqrt(");
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
    onAnswer(normalizeMathInput(value));
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
        className="step-input"
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
      {showMathKeyboard && !forceHideKeyboard && (
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
                    onClick={() => insertText(getInsertText(key))}
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
