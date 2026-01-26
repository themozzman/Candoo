import React, { useEffect, useMemo, useState } from "react";
import {
  fetchFlows,
  fetchMe,
  login,
  logout,
  signup,
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
  const [authPassword, setAuthPassword] = useState("");
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
      });
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
    try {
      const data =
        authMode === "signup"
          ? await signup(authUsername, authPassword)
          : await login(authUsername, authPassword);
      setAuthUser(data);
      setStudentId(data.username);
      setAuthPassword("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    setError("");
    try {
      await logout();
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthUser(null);
      resetSessionView();
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

      {!authUser && (
        <section>
          <h2>{authMode === "signup" ? "Sign Up" : "Login"}</h2>
          <form onSubmit={handleAuthSubmit}>
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
    </div>
  );
}
