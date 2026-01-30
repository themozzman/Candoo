import React, { useRef, useState } from "react";

const BASE_KEYS = [
  ["7", "8", "9", { label: "÷", value: "/", alt: ["÷", "/"] }],
  ["4", "5", "6", { label: "×", value: "*", alt: ["×", "*", "·"] }],
  ["1", "2", "3", { label: "−", value: "-", alt: ["−", "-"] }],
  ["0", ".", "=", "+"]
];

const EXTRA_KEYS = [
  { label: "x", value: "x" },
  { label: "y", value: "y" },
  { label: "π", value: "pi" },
  { label: "√", value: "sqrt(" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
  { label: "^", value: "^" }
];

const FUNCTION_KEYS = [
  { label: "sin", value: "sin(" },
  { label: "cos", value: "cos(" },
  { label: "tan", value: "tan(" },
  { label: "sec", value: "sec(" },
  { label: "csc", value: "csc(" },
  { label: "cot", value: "cot(" },
  { label: "arcsin", value: "arcsin(" },
  { label: "arccos", value: "arccos(" },
  { label: "arctan", value: "arctan(" },
  { label: "log", value: "log(" },
  { label: "ln", value: "ln(" },
  { label: "nth root", value: "root(" }
];

const LONG_PRESS_MS = 450;

export default function SAStep({ step, onAnswer, onSkip, showMathKeyboard = false }) {
  const [value, setValue] = useState("");
  const [showFunctions, setShowFunctions] = useState(false);
  const [altOptions, setAltOptions] = useState(null);
  const inputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const didLongPressRef = useRef(false);

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
    setAltOptions(null);
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
    setAltOptions(null);
    updateValue("", 0);
  };

  const startLongPress = (key) => {
    if (!key?.alt) {
      return;
    }
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      setAltOptions(key.alt);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleKeyClick = (key) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    insertText(key.value);
  };

  const handleAltInsert = (option) => {
    insertText(option);
  };

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
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {showMathKeyboard && (
        <div className="math-keyboard">
          <div className="math-keyboard-grid">
            {BASE_KEYS.flat().map((item) => {
              const key = typeof item === "string" ? { label: item, value: item } : item;
              return (
                <button
                  key={key.label}
                  type="button"
                  className="math-keyboard-key"
                  onClick={() => handleKeyClick(key)}
                  onPointerDown={() => startLongPress(key)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {key.label}
                </button>
              );
            })}
          </div>
          {altOptions && (
            <div className="math-alt-panel">
              {altOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="math-keyboard-key"
                  onClick={() => handleAltInsert(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="math-keyboard-strip">
            {EXTRA_KEYS.map((key) => (
              <button
                key={key.label}
                type="button"
                className="math-keyboard-key"
                onClick={() => insertText(key.value)}
              >
                {key.label}
              </button>
            ))}
          </div>
          <div className="math-keyboard-actions">
            <button
              type="button"
              className="math-keyboard-key math-keyboard-toggle"
              onClick={() => setShowFunctions((prev) => !prev)}
            >
              Functions
            </button>
            <button
              type="button"
              className="math-keyboard-key"
              onClick={backspace}
            >
              ⌫
            </button>
            <button
              type="button"
              className="math-keyboard-key"
              onClick={clearValue}
            >
              Clear
            </button>
          </div>
          {showFunctions && (
            <div className="math-function-panel">
              {FUNCTION_KEYS.map((key) => (
                <button
                  key={key.label}
                  type="button"
                  className="math-keyboard-key"
                  onClick={() => insertText(key.value)}
                >
                  {key.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
