import React, { useEffect, useMemo, useState } from "react";
import {
  adminApproveFlow,
  adminApproveSpec,
  adminGenerateSpec,
  fetchCourses,
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
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [studentId, setStudentId] = useState("student-1");
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [viewMode, setViewMode] = useState("catalog");
  const [catalogNotice, setCatalogNotice] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminTopic, setAdminTopic] = useState("");
  const [adminCourseId, setAdminCourseId] = useState("");
  const [adminSpec, setAdminSpec] = useState(null);
  const [adminSpecId, setAdminSpecId] = useState("");
  const [adminSpecText, setAdminSpecText] = useState("");
  const [adminFlow, setAdminFlow] = useState(null);
  const [adminFlowId, setAdminFlowId] = useState("");
  const [adminFlowText, setAdminFlowText] = useState("");
  const [adminStatus, setAdminStatus] = useState("");
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

  const loadCourses = (preserveSelection = true) => {
    fetchCourses()
      .then((data) => {
        setCourses(data);
        if (data.length > 0) {
          const current = data.find((course) => course.id === selectedCourseId);
          if (!preserveSelection || !current) {
            setSelectedCourseId(data[0].id);
            setSelectedFlowId(data[0].active_flow_id || "");
          } else if (current.active_flow_id !== selectedFlowId) {
            setSelectedFlowId(current.active_flow_id || "");
          }
        }
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadCourses(false);

    const handleFocus = () => {
      loadCourses(true);
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    fetchMe()
      .then((data) => {
        setAuthUser(data);
        setStudentId(data.username);
        setViewMode("catalog");
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

  const courseOptions = useMemo(
    () =>
      courses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      )),
    [courses]
  );

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId),
    [courses, selectedCourseId]
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
        setViewMode("catalog");
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
      setViewMode("catalog");
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
      setViewMode("catalog");
      setVerifyCode("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCourseSelect = (course) => {
    if (!course.active_flow_id) {
      setCatalogNotice("This course is coming soon.");
      return;
    }
    setCatalogNotice("");
    setSelectedCourseId(course.id);
    setSelectedFlowId(course.active_flow_id);
    setViewMode("runner");
  };

  const handleAdminGenerateSpec = async (event) => {
    event.preventDefault();
    setAdminStatus("");
    try {
      const courseId = adminCourseId || selectedCourseId;
      const data = await adminGenerateSpec(adminToken, adminTopic, courseId);
      setAdminSpec(data.spec);
      setAdminSpecId(data.spec_id);
      setAdminSpecText(JSON.stringify(data.spec, null, 2));
      setAdminFlow(null);
      setAdminFlowId("");
      setAdminFlowText("");
    } catch (err) {
      setAdminStatus(err.message);
    }
  };

  const handleAdminApproveSpec = async () => {
    setAdminStatus("");
    try {
      const override = adminSpecText ? JSON.parse(adminSpecText) : null;
      const data = await adminApproveSpec(adminToken, adminSpecId, override);
      setAdminFlow(data.flow);
      setAdminFlowId(data.flow_id);
      setAdminFlowText(JSON.stringify(data.flow, null, 2));
    } catch (err) {
      setAdminStatus(err.message);
    }
  };

  const handleAdminApproveFlow = async () => {
    setAdminStatus("");
    try {
      await adminApproveFlow(adminToken, adminFlowId);
      setAdminStatus("Flow approved and published.");
      loadCourses(true);
    } catch (err) {
      setAdminStatus(err.message);
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
            <button
              className="button-ghost"
              type="button"
              onClick={() => setAdminOpen((prev) => !prev)}
            >
              {adminOpen ? "Close admin" : "Admin"}
            </button>
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

        {authChecked && authUser && viewMode === "catalog" && (
          <section className="course-catalog">
            <div className="course-header">
              <div>
                <h2 className="course-title">Select Your Course</h2>
                <p className="course-subtitle">
                  Choose the course you would like to enroll in.
                </p>
              </div>
            </div>
            {catalogNotice && (
              <div className="course-note">{catalogNotice}</div>
            )}
            <div className="course-grid">
              {courses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className="course-card"
                  onClick={() => handleCourseSelect(course)}
                  disabled={!course.active_flow_id}
                >
                  <div className="course-icon">📘</div>
                  <div className="course-name">{course.name}</div>
                  <div className="course-topic">{course.subtitle}</div>
                  <div className="course-description">{course.description}</div>
                </button>
              ))}
            </div>
            {adminOpen && (
              <div className="admin-panel">
                <h3 className="card-title">Admin: Generate AI Flow</h3>
                <form className="admin-form" onSubmit={handleAdminGenerateSpec}>
                  <div className="form-field">
                    <label className="form-label">Admin token</label>
                    <input
                      className="form-input"
                      type="password"
                      value={adminToken}
                      onChange={(event) => setAdminToken(event.target.value)}
                      placeholder="Enter admin token"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Course</label>
                    <select
                      className="form-select"
                      value={adminCourseId || selectedCourseId}
                      onChange={(event) => setAdminCourseId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select a course
                      </option>
                      {courseOptions}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-label">Topic</label>
                    <input
                      className="form-input"
                      type="text"
                      value={adminTopic}
                      onChange={(event) => setAdminTopic(event.target.value)}
                      placeholder="e.g., French adjective to adverb rules"
                      required
                    />
                  </div>
                  <button className="button-primary" type="submit">
                    Generate spec
                  </button>
                </form>
                {adminStatus && <div className="admin-status">{adminStatus}</div>}
                {adminSpec && (
                  <div className="admin-block">
                    <h4 className="admin-title">Spec draft</h4>
                    <textarea
                      className="admin-textarea"
                      value={adminSpecText}
                      onChange={(event) => setAdminSpecText(event.target.value)}
                      rows={10}
                    />
                    <button className="button-secondary" type="button" onClick={handleAdminApproveSpec}>
                      Approve spec & generate flow
                    </button>
                  </div>
                )}
                {adminFlow && (
                  <div className="admin-block">
                    <h4 className="admin-title">Generated flow</h4>
                    <textarea
                      className="admin-textarea"
                      value={adminFlowText}
                      onChange={(event) => setAdminFlowText(event.target.value)}
                      rows={12}
                    />
                    <button className="button-primary" type="button" onClick={handleAdminApproveFlow}>
                      Approve & publish flow
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {authChecked && authUser && viewMode === "runner" && (
          <section className="runner">
            <div className="runner-header">
              <div>
                <h2 className="runner-title">Student Runner</h2>
                <p className="runner-subtitle">
                  Practice the selected course and answer each step.
                </p>
              </div>
              <button
                className="button-ghost"
                type="button"
                onClick={() => setViewMode("catalog")}
              >
                Back to courses
              </button>
            </div>

            <div className="runner-grid">
              <div className="card">
                <h3 className="card-title">Session setup</h3>
                <div className="form-field">
                  <label className="form-label">Course</label>
                  <input
                    className="form-input"
                    type="text"
                    value={selectedCourse?.name || ""}
                    disabled
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Flow ID</label>
                  <input
                    className="form-input"
                    type="text"
                    value={selectedFlowId}
                    disabled
                  />
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
                <button
                  className="button-primary"
                  onClick={handleStart}
                  disabled={!selectedFlowId}
                >
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
