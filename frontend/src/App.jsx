import React, { useEffect, useMemo, useState } from "react";
import {
  fetchFlows,
  fetchMe,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signupWithEmail,
  verifyEmail,
  startSession,
  submitAnswer
} from "./api.js";
import MCStep from "./components/MCStep.jsx";
import SAStep from "./components/SAStep.jsx";
import Feedback from "./components/Feedback.jsx";

export default function App() {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [studentId, setStudentId] = useState("student-1");
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [activeFlow, setActiveFlow] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [stepStartTs, setStepStartTs] = useState(null);

  useEffect(() => {
    const loadFlows = (preserveSelection = true) => {
      fetchFlows()
        .then((data) => {
          setFlows(data);
          if (data.length > 0) {
            if (!preserveSelection || !data.find((flow) => flow.id === selectedFlowId)) {
              setSelectedFlowId(data[0].id);
            }
          }
        })
        .catch((err) => setError(err.message));
    };

    loadFlows(false);

    const handleFocus = () => {
      loadFlows(true);
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    fetchMe()
      .then((data) => {
        setAuthUser(data);
        setStudentId(data.username);
      })
      .catch(() => {
        setAuthUser(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset_token");
    if (token) {
      setResetToken(token);
      setAuthMode("reset");
    }
  }, []);

  const flowOptions = useMemo(
    () =>
      flows.map((flow) => (
        <option key={flow.id} value={flow.id}>
          {flow.title} ({flow.topic})
        </option>
      )),
    [flows]
  );

  const resetSessionView = () => {
    setSessionId(null);
    setCurrentStep(null);
    setActiveFlow(null);
    setResult(null);
    setStepStartTs(null);
  };

  const handleStart = async () => {
    setError("");
    resetSessionView();
    try {
      const data = await startSession(selectedFlowId, studentId);
      setSessionId(data.session_id);
      setActiveFlow(data.flow);
      setCurrentStep(data.step);
      setResult(null);
      setStepStartTs(Date.now());
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (response, skipped = false) => {
    if (!sessionId || !currentStep) {
      return;
    }
    setError("");
    try {
      const timeSpent = stepStartTs ? Date.now() - stepStartTs : 0;
      const data = await submitAnswer(sessionId, {
        step_id: currentStep.id,
        response,
        time_spent_ms: timeSpent,
        skipped
      });
      setResult(data);
      if (data.next_step) {
        setCurrentStep(data.next_step);
        setStepStartTs(Date.now());
      } else {
        setCurrentStep(null);
        setStepStartTs(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    try {
      if (authMode === "signup") {
        const data = await signupWithEmail(
          authUsername,
          authEmail,
          authPassword,
          authConfirmPassword
        );
        if (data.needs_verification) {
          setAuthMessage("Check your email for a verification code.");
          setAuthMode("verify");
        }
        setAuthPassword("");
        setAuthConfirmPassword("");
      } else {
        const data = await login(authUsername, authPassword);
        setAuthUser(data);
        setStudentId(data.username);
        setAuthPassword("");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    setError("");
    setAuthMessage("");
    try {
      await logout();
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthUser(null);
      resetSessionView();
    }
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    try {
      await requestPasswordReset(authEmail);
      setAuthMessage("If the email exists, a reset link has been sent.");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    try {
      await resetPassword(resetToken, resetPasswordValue);
      setAuthMessage("Password reset successful. Please log in.");
      setAuthPassword("");
      setResetPasswordValue("");
      setAuthMode("login");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();
    setError("");
    setAuthMessage("");
    try {
      const data = await verifyEmail(authEmail, verifyCode);
      setAuthUser(data);
      setStudentId(data.username);
      setVerifyCode("");
    } catch (err) {
      setError(err.message);
    }
  };

  const authTitle = {
    login: "Welcome back",
    signup: "Create account",
    forgot: "Reset password",
    reset: "Set new password",
    verify: "Verify email"
  }[authMode];

  const authSubtitle = {
    login: "Enter your credentials to access your account",
    signup: "Create your account to get started",
    forgot: "We’ll send a reset link to your email",
    reset: "Choose a new password for your account",
    verify: "Enter the code sent to your email"
  }[authMode];

  return (
    <div className="app">
      {authChecked && authUser && (
        <header className="app-header">
          <div>
            <h1 className="app-title">Guided Learning Flow Engine</h1>
            <p className="app-subtitle">
              Guided practice with instant feedback and step tracking.
            </p>
          </div>
          <div className="user-chip">
            <span className="user-name">{authUser.username}</span>
            <button className="button-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>
      )}

      <main className={authUser ? "app-main" : "auth-main"}>
        {!authChecked && (
          <div className="auth-card">
            <h2 className="auth-title">Checking session</h2>
            <p className="auth-subtitle">Loading your account...</p>
          </div>
        )}
        {authChecked && !authUser && (
          <div className="auth-card">
            <h2 className="auth-title">{authTitle}</h2>
            <p className="auth-subtitle">{authSubtitle}</p>

            {error && <div className="auth-error">Error: {error}</div>}
            {authMessage && <div className="auth-message">{authMessage}</div>}

            {authMode === "forgot" && (
              <form onSubmit={handleForgotSubmit}>
                <div className="auth-field">
                  <label className="auth-label">Email</label>
                  <input
                    className="auth-input"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <button className="auth-button" type="submit">
                  Send reset link
                </button>
                <div className="auth-footer">
                  <button type="button" onClick={() => setAuthMode("login")}>
                    Back to login
                  </button>
                </div>
              </form>
            )}

            {authMode === "reset" && (
              <form onSubmit={handleResetSubmit}>
                <div className="auth-field">
                  <label className="auth-label">Reset token</label>
                  <input
                    className="auth-input"
                    type="text"
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">New password</label>
                  <input
                    className="auth-input"
                    type="password"
                    value={resetPasswordValue}
                    onChange={(event) => setResetPasswordValue(event.target.value)}
                    required
                  />
                </div>
                <button className="auth-button" type="submit">
                  Update password
                </button>
                <div className="auth-footer">
                  <button type="button" onClick={() => setAuthMode("login")}>
                    Back to login
                  </button>
                </div>
              </form>
            )}

            {authMode === "verify" && (
              <form onSubmit={handleVerifySubmit}>
                <div className="auth-field">
                  <label className="auth-label">Email</label>
                  <input
                    className="auth-input"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Verification code</label>
                  <input
                    className="auth-input"
                    type="text"
                    value={verifyCode}
                    onChange={(event) => setVerifyCode(event.target.value)}
                    required
                  />
                </div>
                <button className="auth-button" type="submit">
                  Verify
                </button>
                <div className="auth-footer">
                  <button type="button" onClick={() => setAuthMode("login")}>
                    Back to login
                  </button>
                </div>
              </form>
            )}

            {(authMode === "login" || authMode === "signup") && (
              <form onSubmit={handleAuthSubmit}>
                {authMode === "signup" && (
                  <div className="auth-field">
                    <label className="auth-label">Email</label>
                    <input
                      className="auth-input"
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                )}
                <div className="auth-field">
                  <label className="auth-label">Username</label>
                  <input
                    className="auth-input"
                    type="text"
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    placeholder="username"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Password</label>
                  <input
                    className="auth-input"
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
                {authMode === "signup" && (
                  <div className="auth-field">
                    <label className="auth-label">Confirm password</label>
                    <input
                      className="auth-input"
                      type="password"
                      value={authConfirmPassword}
                      onChange={(event) => setAuthConfirmPassword(event.target.value)}
                      required
                    />
                  </div>
                )}
                {authMode === "login" && (
                  <div className="auth-actions">
                    <button
                      className="auth-link"
                      type="button"
                      onClick={() => setAuthMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                <button className="auth-button" type="submit">
                  {authMode === "signup" ? "Sign up" : "Sign in"}
                </button>
                <div className="auth-footer">
                  {authMode === "signup"
                    ? "Already have an account?"
                    : "Don't have an account?"}
                  <button
                    type="button"
                    onClick={() =>
                      setAuthMode(authMode === "signup" ? "login" : "signup")
                    }
                  >
                    {authMode === "signup" ? "Sign in" : "Sign up"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {authChecked && authUser && (
          <section className="runner">
            <div className="runner-header">
              <div>
                <h2 className="runner-title">Student Runner</h2>
                <p className="runner-subtitle">
                  Choose a flow, start a session, and answer each step.
                </p>
              </div>
            </div>

            <div className="runner-grid">
              <div className="card">
                <h3 className="card-title">Session setup</h3>
                <div className="form-field">
                  <label className="form-label">Flow</label>
                  <select
                    className="form-select"
                    value={selectedFlowId}
                    onChange={(event) => setSelectedFlowId(event.target.value)}
                  >
                    {flowOptions}
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">Student ID</label>
                  <input
                    className="form-input"
                    type="text"
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    disabled
                  />
                </div>
                <button className="button-primary" onClick={handleStart}>
                  Start session
                </button>
              </div>

              <div className="card">
                <h3 className="card-title">Current flow</h3>
                {activeFlow ? (
                  <div className="flow-summary">
                    <div className="flow-title">{activeFlow.title}</div>
                    <div className="flow-statement">{activeFlow.statement}</div>
                  </div>
                ) : (
                  <div className="flow-empty">
                    Start a session to see the flow details here.
                  </div>
                )}
              </div>
            </div>

            <div className="card runner-step">
              <h3 className="card-title">Current step</h3>
              {currentStep ? (
                currentStep.type === "MC" ? (
                  <MCStep
                    step={currentStep}
                    onAnswer={(value) => handleSubmit(value, false)}
                    onSkip={() => handleSubmit("", true)}
                  />
                ) : (
                  <SAStep
                    step={currentStep}
                    onAnswer={(value) => handleSubmit(value, false)}
                    onSkip={() => handleSubmit("", true)}
                  />
                )
              ) : sessionId ? (
                <div className="session-complete">
                  Session completed. Start a new session to try again.
                </div>
              ) : (
                <div className="session-empty">
                  Start a session to load the first question.
                </div>
              )}
              <Feedback result={result} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
