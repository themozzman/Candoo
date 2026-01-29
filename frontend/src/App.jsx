import React, { useEffect, useMemo, useState } from "react";
import {
  adminApproveFlow,
  adminApproveSpec,
  adminCourseStudents,
  adminGenerateSpec,
  adminListUsers,
  adminSetCourseStudents,
  fetchCourses,
  fetchFlows,
  fetchMe,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  startSession,
  submitAnswer
} from "./api.js";
import MCStep from "./components/MCStep.jsx";
import SAStep from "./components/SAStep.jsx";
import Feedback from "./components/Feedback.jsx";

export default function App() {
  const [courses, setCourses] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [studentId, setStudentId] = useState("student-1");
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [viewMode, setViewMode] = useState("catalog");
  const [catalogNotice, setCatalogNotice] = useState("");
  const [adminTokenReady, setAdminTokenReady] = useState(false);
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
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminCourseRosterId, setAdminCourseRosterId] = useState("");
  const [adminCourseStudentIds, setAdminCourseStudentIds] = useState([]);
  const [adminRosterStatus, setAdminRosterStatus] = useState("");
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

  const adminEmails = ["andrestoussieh3@gmail.com"];
  const isAdmin =
    authUser?.email && adminEmails.includes(authUser.email.toLowerCase());

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

  const loadFlows = () => {
    fetchFlows()
      .then((data) => setFlows(data))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadCourses(false);
    loadFlows();

    const handleFocus = () => {
      loadCourses(true);
      loadFlows();
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
    if (!adminCourseRosterId && courses.length > 0) {
      setAdminCourseRosterId(courses[0].id);
    }
  }, [courses, adminCourseRosterId]);

  useEffect(() => {
    if (!isAdmin || viewMode !== "admin" || !adminTokenReady) {
      return;
    }
    adminListUsers(adminToken)
      .then((data) => setAdminUsers(data.users || []))
      .catch((err) => setAdminRosterStatus(err.message));
  }, [isAdmin, viewMode, adminTokenReady, adminToken]);

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

  const courseFlows = useMemo(() => {
    if (!selectedCourseId) {
      return [];
    }
    const activeId = selectedCourse?.active_flow_id;
    return flows.filter((flow) => {
      if (flow.id === activeId) {
        return true;
      }
      return flow.id.startsWith(`${selectedCourseId}-`);
    });
  }, [flows, selectedCourseId, selectedCourse]);

  useEffect(() => {
    if (!selectedCourseId) {
      return;
    }
    const activeId = selectedCourse?.active_flow_id || "";
    const availableIds = new Set(courseFlows.map((flow) => flow.id));
    if (selectedFlowId && availableIds.has(selectedFlowId)) {
      return;
    }
    if (activeId && availableIds.has(activeId)) {
      setSelectedFlowId(activeId);
      return;
    }
    if (courseFlows.length > 0) {
      setSelectedFlowId(courseFlows[0].id);
    } else {
      setSelectedFlowId("");
    }
  }, [courseFlows, selectedCourse, selectedCourseId, selectedFlowId]);

  const visibleCourses = useMemo(() => courses, [courses]);

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
      const data = await login(authUsername, authPassword);
      setAuthUser(data);
      setStudentId(data.username);
      setViewMode("catalog");
      setAuthPassword("");
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
      setAdminTokenReady(false);
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


  const handleCourseSelect = (course) => {
    if (!course.active_flow_id && !isAdmin) {
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
      loadFlows();
    } catch (err) {
      setAdminStatus(err.message);
    }
  };

  const handleAdminLoadRoster = async () => {
    if (!adminCourseRosterId) {
      setAdminRosterStatus("Select a course to manage.");
      return;
    }
    setAdminRosterStatus("");
    try {
      const data = await adminCourseStudents(adminToken, adminCourseRosterId);
      const assigned = (data.students || []).map((student) => student.id);
      setAdminCourseStudentIds(assigned);
    } catch (err) {
      setAdminRosterStatus(err.message);
    }
  };

  const toggleStudentAssignment = (studentId) => {
    setAdminCourseStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
  };

  const handleAdminSaveRoster = async () => {
    if (!adminCourseRosterId) {
      setAdminRosterStatus("Select a course to manage.");
      return;
    }
    setAdminRosterStatus("");
    try {
      const data = await adminSetCourseStudents(
        adminToken,
        adminCourseRosterId,
        adminCourseStudentIds
      );
      const assigned = (data.students || []).map((student) => student.id);
      setAdminCourseStudentIds(assigned);
      setAdminRosterStatus("Roster updated.");
      loadCourses(true);
    } catch (err) {
      setAdminRosterStatus(err.message);
    }
  };

  const handleAdminAuth = async (event) => {
    event.preventDefault();
    setAdminRosterStatus("");
    if (!adminToken) {
      setAdminRosterStatus("Enter your admin token to continue.");
      return;
    }
    setAdminTokenReady(true);
  };

  const authTitle = {
    login: "Welcome back",
    forgot: "Reset password",
    reset: "Set new password"
  }[authMode];

  const authSubtitle = {
    login: "Enter your credentials to access your account",
    forgot: "We’ll send a reset link to your email",
    reset: "Choose a new password for your account"
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
            {isAdmin && adminStatus && (
              <div className="admin-banner">{adminStatus}</div>
            )}
          </div>
          <div className="user-chip">
            <span className="user-name">{authUser.username}</span>
            {isAdmin && <span className="user-role">Admin</span>}
            {isAdmin && (
              <button
                className="button-ghost"
                type="button"
                onClick={() =>
                  setViewMode((prev) => (prev === "admin" ? "catalog" : "admin"))
                }
              >
                {viewMode === "admin" ? "Close admin" : "Admin dashboard"}
              </button>
            )}
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

            {authMode === "login" && (
              <form onSubmit={handleAuthSubmit}>
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
                <div className="auth-actions">
                  <button
                    className="auth-link"
                    type="button"
                    onClick={() => setAuthMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </div>
                <button className="auth-button" type="submit">
                  Sign in
                </button>
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
              {visibleCourses.map((course) => (
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
            {!isAdmin && visibleCourses.length === 0 && (
              <div className="course-note">No courses are available yet.</div>
            )}
          </section>
        )}

        {authChecked && authUser && viewMode === "admin" && isAdmin && (
          <section className="admin-dashboard">
            <div className="admin-dashboard-header">
              <div>
                <h2 className="admin-dashboard-title">Admin course dashboard</h2>
                <p className="admin-dashboard-subtitle">
                  Add or remove students from courses and publish AI flows.
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

            <div className="admin-dashboard-grid">
              <div className="admin-card">
                <h3 className="card-title">Admin access</h3>
                <form onSubmit={handleAdminAuth} className="admin-token-form">
                  <div className="form-field">
                    <label className="form-label">Admin token</label>
                    <input
                      className="form-input"
                      type="password"
                      value={adminToken}
                      onChange={(event) => {
                        setAdminToken(event.target.value);
                        setAdminTokenReady(false);
                      }}
                      placeholder="Enter admin token"
                      required
                    />
                  </div>
                  <button className="button-primary" type="submit">
                    Unlock admin tools
                  </button>
                </form>
                {adminRosterStatus && <div className="admin-status">{adminRosterStatus}</div>}
              </div>

              <div className="admin-card">
                <h3 className="card-title">Courses</h3>
                <div className="admin-course-list">
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      className={
                        course.id === (adminCourseRosterId || selectedCourseId)
                          ? "admin-course-item active"
                          : "admin-course-item"
                      }
                      onClick={() => setAdminCourseRosterId(course.id)}
                    >
                      <div className="admin-course-name">{course.name}</div>
                      <div className="admin-course-subtitle">{course.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-card admin-card-wide">
                <h3 className="card-title">Course roster</h3>
                <p className="admin-helper">
                  Select a course to assign students. Unassigned students will not
                  see any courses.
                </p>
                <div className="admin-roster-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={handleAdminLoadRoster}
                    disabled={!adminTokenReady}
                  >
                    Load roster
                  </button>
                  <button
                    className="button-primary"
                    type="button"
                    onClick={handleAdminSaveRoster}
                    disabled={!adminTokenReady}
                  >
                    Save roster
                  </button>
                </div>
                <div className="admin-roster-grid">
                  <div>
                    <h4 className="admin-subtitle">Assigned students</h4>
                    <div className="admin-roster">
                      {adminUsers.length === 0 ? (
                        <div className="admin-empty">No students found.</div>
                      ) : (
                        adminUsers
                          .filter((student) => adminCourseStudentIds.includes(student.id))
                          .map((student) => (
                            <label key={student.id} className="admin-user-row">
                              <input
                                type="checkbox"
                                checked={adminCourseStudentIds.includes(student.id)}
                                onChange={() => toggleStudentAssignment(student.id)}
                              />
                              <span className="admin-user-name">{student.username}</span>
                              <span className="admin-user-email">
                                {student.email || "no email"}
                              </span>
                            </label>
                          ))
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="admin-subtitle">Unassigned students</h4>
                    <div className="admin-roster">
                      {adminUsers.length === 0 ? (
                        <div className="admin-empty">No students found.</div>
                      ) : (
                        adminUsers
                          .filter((student) => !adminCourseStudentIds.includes(student.id))
                          .map((student) => (
                            <label key={student.id} className="admin-user-row">
                              <input
                                type="checkbox"
                                checked={adminCourseStudentIds.includes(student.id)}
                                onChange={() => toggleStudentAssignment(student.id)}
                              />
                              <span className="admin-user-name">{student.username}</span>
                              <span className="admin-user-email">
                                {student.email || "no email"}
                              </span>
                            </label>
                          ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-card admin-card-wide">
                <h3 className="card-title">AI flow generator</h3>
                <form className="admin-form" onSubmit={handleAdminGenerateSpec}>
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
                  <button className="button-primary" type="submit" disabled={!adminTokenReady}>
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
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={handleAdminApproveSpec}
                      disabled={!adminTokenReady}
                    >
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
                    <button
                      className="button-primary"
                      type="button"
                      onClick={handleAdminApproveFlow}
                      disabled={!adminTokenReady}
                    >
                      Approve & publish flow
                    </button>
                  </div>
                )}
              </div>
            </div>
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
                  {courseFlows.length > 1 ? (
                    <select
                      className="form-select"
                      value={selectedFlowId}
                      onChange={(event) => setSelectedFlowId(event.target.value)}
                    >
                      {courseFlows.map((flow) => (
                        <option key={flow.id} value={flow.id}>
                          {flow.title} ({flow.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="form-input"
                      type="text"
                      value={selectedFlowId}
                      disabled
                    />
                  )}
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
