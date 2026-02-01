import React, { useEffect, useRef, useState } from "react";
import MathPrompt from "./MathPrompt.jsx";

const KEYBOARD_TABS = [
  {
    id: "basic",
    label: "Basic",
    keys: [
      { label: "x²", action: "power2" },
      { label: "xⁿ", action: "powerN" },
      { label: "□/□", action: "fraction" },
      { label: "ⁿ√", action: "nthRoot" },
      { label: "÷", insert: "÷" },
      { label: "log", insert: "log(" },
      { label: "π", insert: "π" },
      { label: "θ", insert: "θ" },
      { label: "∞", insert: "∞" },
      { label: "∫a^b", action: "boundedIntegral" },
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
      { label: "eⁿ", action: "expN" },
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
      { label: "ⁿ√", action: "nthRoot" },
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
  const superscriptModeRef = useRef(false);
  const isSpotError = /identify the error/i.test(step.prompt || "");

  const getSelection = () => {
    const input = inputRef.current;
    const fallback = value.length;
    return {
      start: input?.selectionStart ?? fallback,
      end: input?.selectionEnd ?? fallback
    };
  };

  const updateValue = (nextValue, selectionStart, selectionEnd = null) => {
    setValue(nextValue);
    if (!inputRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      inputRef.current.focus();
      if (typeof selectionStart === "number") {
        const end = typeof selectionEnd === "number" ? selectionEnd : selectionStart;
        inputRef.current.setSelectionRange(selectionStart, end);
      }
    });
  };

  const insertText = (text) => {
    const { start, end } = getSelection();
    const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
    updateValue(nextValue, start + text.length);
  };

  const insertTemplate = (template, selectStart, selectLength = 1) => {
    const { start, end } = getSelection();
    const nextValue = `${value.slice(0, start)}${template}${value.slice(end)}`;
    const selectionStart = start + selectStart;
    updateValue(nextValue, selectionStart, selectionStart + selectLength);
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

  const superscriptMap = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹"
  };
  const superscriptLetterMap = {
    a: "ᵃ",
    b: "ᵇ",
    c: "ᶜ",
    d: "ᵈ",
    e: "ᵉ",
    f: "ᶠ",
    g: "ᵍ",
    h: "ʰ",
    i: "ⁱ",
    j: "ʲ",
    k: "ᵏ",
    l: "ˡ",
    m: "ᵐ",
    n: "ⁿ",
    o: "ᵒ",
    p: "ᵖ",
    r: "ʳ",
    s: "ˢ",
    t: "ᵗ",
    u: "ᵘ",
    v: "ᵛ",
    w: "ʷ",
    x: "ˣ",
    y: "ʸ",
    z: "ᶻ"
  };
  const superscriptPlaceholder = "ⁿ";
  const placeholderMarker = "\u2060";
  const placeholderToken = `${superscriptPlaceholder}${placeholderMarker}`;
  const placeholderBox = "□";
  const superscriptPlaceholderBox = "▫";
  const superscriptDigits = Object.values(superscriptMap);
  const superscriptLetters = Object.values(superscriptLetterMap);
  const superscriptToNormal = {
    ...Object.fromEntries(
      Object.entries(superscriptMap).map(([digit, sup]) => [sup, digit])
    ),
    ...Object.fromEntries(
      Object.entries(superscriptLetterMap).map(([letter, sup]) => [sup, letter])
    )
  };

  const isSuperscriptChar = (char) =>
    superscriptDigits.includes(char) ||
    superscriptLetters.includes(char) ||
    char === superscriptPlaceholder ||
    char === superscriptPlaceholderBox;

  const toSuperscript = (valueStr) => {
    if (!valueStr || !/^\d+$/.test(valueStr)) {
      return null;
    }
    return valueStr
      .split("")
      .map((char) => superscriptMap[char] || char)
      .join("");
  };

  const hasSuperscriptChar = (text) => {
    if (!text) {
      return false;
    }
    return [...text].some(isSuperscriptChar);
  };

  const toSuperscriptLetter = (char) => {
    const lowered = char.toLowerCase();
    return superscriptLetterMap[lowered] || char;
  };

  const moveSelectionToNextPlaceholder = () => {
    const { start, end } = getSelection();
    const selected = value.slice(start, end);
    const isSelectedPlaceholder =
      selected === placeholderBox || selected === superscriptPlaceholderBox;
    const searchStart = isSelectedPlaceholder ? end : start;
    const nextIndex = value
      .slice(searchStart)
      .search(new RegExp(`[${placeholderBox}${superscriptPlaceholderBox}]`));
    if (nextIndex === -1) {
      return false;
    }
    const targetIndex = searchStart + nextIndex;
    updateValue(value, targetIndex, targetIndex + 1);
    superscriptModeRef.current = value[targetIndex] === superscriptPlaceholderBox;
    return true;
  };


  const wrapBase = (base) => {
    if (!base) {
      return "x";
    }
    return base.length > 1 ? `(${base})` : base;
  };

  const applyPower = (exp, baseOverride = null) => {
    const base = baseOverride ?? value;
    const cleanExp = `${exp}`.trim();
    if (!cleanExp) {
      return;
    }
    const superscript = toSuperscript(cleanExp);
    const displayBase = wrapBase(base || "x");
    const display = superscript
      ? `${displayBase}${superscript}`
      : `${displayBase}^(${cleanExp})`;
    updateValue(display, display.length);
  };

  const handlePowerN = () => {
    const base = value || "x";
    const template = `${wrapBase(base)}${placeholderToken}`;
    const selectStart = template.indexOf(superscriptPlaceholder);
    updateValue(template, selectStart, selectStart + placeholderToken.length);
    superscriptModeRef.current = true;
  };

  const handlePower2 = () => {
    const base = value || "x";
    const template = `${wrapBase(base)}²`;
    updateValue(template, template.length);
  };

  const handleFraction = () => {
    const box = superscriptModeRef.current
      ? superscriptPlaceholderBox
      : placeholderBox;
    const template = `${box}/${box}`;
    const selectStart = template.indexOf(box);
    updateValue(template, selectStart, selectStart + 1);
  };

  const handleExpN = () => {
    insertTemplate(`e${placeholderToken}`, 1, placeholderToken.length);
    superscriptModeRef.current = true;
  };

  const handleNthRoot = () => {
    const base = value || "x";
    const template = `√[□](${base})`;
    const selectStart = template.indexOf("□");
    updateValue(template, selectStart, selectStart + 1);
  };

  const handleBoundedIntegral = () => {
    const expr = value || "f(x)";
    const template = `∫[□,□](${expr})`;
    const selectStart = template.indexOf("□");
    updateValue(template, selectStart, selectStart + 1);
  };

  const handleKeyAction = (key) => {
    switch (key.action) {
      case "power2":
        handlePower2();
        break;
      case "powerN":
        handlePowerN();
        break;
      case "fraction":
        handleFraction();
        break;
      case "expN":
        handleExpN();
        break;
      case "nthRoot":
        handleNthRoot();
        break;
      case "boundedIntegral":
        handleBoundedIntegral();
        break;
      default:
        insertText(getInsertText(key));
    }
  };

  const normalizeMathInput = (raw) => {
    if (!raw) {
      return raw;
    }
    let normalized = raw;
    normalized = normalized.replace(new RegExp(placeholderToken, "g"), "");
    normalized = normalized.replace(
      /([A-Za-z0-9\)])([⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ]+)/g,
      (_, base, sup) => {
        const exponent = sup
          .split("")
          .map((char) => superscriptToNormal[char] || "")
          .join("");
        return `${base}^(${exponent})`;
      }
    );
    normalized = normalized.replace(/∛\(/g, "root(");
    normalized = normalized.replace(/√\[(.+?)\]\((.+)\)/g, "root($2, $1)");
    normalized = normalized.replace(/□/g, "");
    normalized = normalized.replace(/▫/g, "");
    normalized = normalized.replace(new RegExp(placeholderMarker, "g"), "");
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
        onKeyDown={(event) => {
          if (!showMathKeyboard || disabled) {
            return;
          }
          if (event.key === "ArrowDown" || event.key === "Tab") {
            if (moveSelectionToNextPlaceholder()) {
              event.preventDefault();
              return;
            }
          }
          if (
            event.key === "ArrowRight" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowUp"
          ) {
            superscriptModeRef.current = false;
            return;
          }
          if (event.key === "^") {
            event.preventDefault();
            insertTemplate(placeholderToken, 0, placeholderToken.length);
            superscriptModeRef.current = true;
            return;
          }
          const { start, end } = getSelection();
          const selected = value.slice(start, end);
          const shouldSuperscript =
            superscriptModeRef.current ||
            (selected && hasSuperscriptChar(selected));
          if (shouldSuperscript && /^\d$/.test(event.key)) {
            event.preventDefault();
            insertText(superscriptMap[event.key]);
            superscriptModeRef.current = true;
            return;
          }
          if (shouldSuperscript && /^[a-zA-Z]$/.test(event.key)) {
            event.preventDefault();
            insertText(toSuperscriptLetter(event.key));
            superscriptModeRef.current = true;
          }
        }}
        onClick={() => {
          superscriptModeRef.current = false;
        }}
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
                    onClick={() => handleKeyAction(key)}
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
