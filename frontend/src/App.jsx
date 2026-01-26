import React, { useEffect, useMemo, useState } from "react";
import {
  fetchFlows,
  fetchMe,
  fetchReport,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signupWithEmail,
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
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [activeFlow, setActiveFlow] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [stepStartTs, setStepStartTs] = useState(null);
  const [reportFlowId, setReportFlowId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const loadFlows = (preserveSelection = true) => {
      fetchFlows()
        .then((data) => {
          setFlows(data);
          if (data.length > 0) {
            if (!preserveSelection || !data.find((flow) => flow.id === selectedFlowId)) {
              setSelectedFlowId(data[0].id);
            }
            if (!preserveSelection || !data.find((flow) => flow.id === reportFlowId)) {
              setReportFlowId(data[0].id);
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
      const data =
        authMode === "signup"
          ? await signupWithEmail(authUsername, authEmail, authPassword)
          : await login(authUsername, authPassword);
      setAuthUser(data);
      setStudentId(data.username);
      setAuthPassword("");
      setAuthEmail("");
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

  const handleLoadReport = async () => {
    if (!reportFlowId) {
      return;
    }
    setError("");
    setReportLoading(true);
    try {
      const data = await fetchReport(reportFlowId);
      setReportData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div>
      <header>
        <h1>Guided Learning Flow Engine</h1>
        {authUser ? (
          <div>
            Logged in as {authUser.username}
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <div>Not logged in</div>
        )}
      </header>

      {error && <div>Error: {error}</div>}
      {authMessage && <div>{authMessage}</div>}

      {!authUser && authMode !== "forgot" && authMode !== "reset" && (
        <section>
          <h2>{authMode === "signup" ? "Sign Up" : "Login"}</h2>
          <form onSubmit={handleAuthSubmit}>
            {authMode === "signup" && (
              <div>
                <label>
                  Email:
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
              </div>
            )}
            <div>
              <label>
                Username:
                <input
                  type="text"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  required
                />
              </label>
            </div>
            <div>
              <label>
                Password:
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit">
              {authMode === "signup" ? "Create Account" : "Login"}
            </button>
          </form>
          <button
            onClick={() =>
              setAuthMode(authMode === "signup" ? "login" : "signup")
            }
          >
            {authMode === "signup"
              ? "Have an account? Login"
              : "Need an account? Sign up"}
          </button>
          <button onClick={() => setAuthMode("forgot")}>Forgot password?</button>
        </section>
      )}

      {!authUser && authMode === "forgot" && (
        <section>
          <h2>Reset Password</h2>
          <form onSubmit={handleForgotSubmit}>
            <div>
              <label>
                Email:
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit">Send Reset Link</button>
          </form>
          <button onClick={() => setAuthMode("login")}>Back to login</button>
        </section>
      )}

      {!authUser && authMode === "reset" && (
        <section>
          <h2>Set New Password</h2>
          <form onSubmit={handleResetSubmit}>
            <div>
              <label>
                Reset Token:
                <input
                  type="text"
                  value={resetToken}
                  onChange={(event) => setResetToken(event.target.value)}
                  required
                />
              </label>
            </div>
            <div>
              <label>
                New Password:
                <input
                  type="password"
                  value={resetPasswordValue}
                  onChange={(event) => setResetPasswordValue(event.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit">Update Password</button>
          </form>
          <button onClick={() => setAuthMode("login")}>Back to login</button>
        </section>
      )}

      {authUser && (
        <section>
          <h2>Student Runner</h2>
          <div>
            <label>
              Flow:
              <select
                value={selectedFlowId}
                onChange={(event) => setSelectedFlowId(event.target.value)}
              >
                {flowOptions}
              </select>
            </label>
          </div>
          <div>
            <label>
              Student ID:
              <input
                type="text"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                disabled
              />
            </label>
          </div>
          <button onClick={handleStart}>Start Session</button>

          {activeFlow && (
            <div>
              <strong>{activeFlow.title}</strong>
              <div>{activeFlow.statement}</div>
            </div>
          )}

          {currentStep && (
            <div>
              {currentStep.type === "MC" ? (
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
              )}
            </div>
          )}

          {!currentStep && sessionId && (
            <div>Session completed. Start a new session to try again.</div>
          )}

          <Feedback result={result} />
        </section>
      )}

      {authUser && (
        <section>
          <h2>Teacher Reports</h2>
          <div>
            <label>
              Flow:
              <select
                value={reportFlowId}
                onChange={(event) => setReportFlowId(event.target.value)}
              >
                {flowOptions}
              </select>
            </label>
            <button onClick={handleLoadReport} disabled={reportLoading}>
              {reportLoading ? "Loading..." : "Load Report"}
            </button>
          </div>

          {!reportData && <div>Select a flow to view report data.</div>}

          {reportData && (
            <pre>{JSON.stringify(reportData, null, 2)}</pre>
          )}
        </section>
      )}
    </div>
  );
}
