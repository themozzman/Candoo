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
  const [adminTab, setAdminTab] = useState("students");
  const [rosterEditMode, setRosterEditMode] = useState(false);
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
  const [courseStudentCounts, setCourseStudentCounts] = useState({});
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
  const [returnView, setReturnView] = useState("catalog");

  const adminEmails = ["andrestoussieh3@gmail.com"];
  const adminUsernames = ["andrestoussieh"];
  const isAdmin = Boolean(
    (authUser?.email && adminEmails.includes(authUser.email.toLowerCase())) ||
      (authUser?.username &&
        adminUsernames.includes(authUser.username.toLowerCase()))
  );

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
    if (!isAdmin || viewMode !== "admin-course" || !adminTokenReady) {
      return;
    }
    adminListUsers(adminToken)
      .then((data) => setAdminUsers(data.users || []))
      .catch((err) => setAdminRosterStatus(err.message));
  }, [isAdmin, viewMode, adminTokenReady, adminToken]);

  useEffect(() => {
    if (
      !isAdmin ||
      viewMode !== "admin-course" ||
      !adminTokenReady ||
      !adminCourseRosterId
    ) {
      return;
    }
    handleAdminLoadRoster();
  }, [isAdmin, viewMode, adminTokenReady, adminCourseRosterId]);

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

  const isMathCourse = useMemo(() => {
    if (!selectedCourse) {
      return false;
    }
    const haystack = [
      selectedCourse.id,
      selectedCourse.name,
      selectedCourse.subtitle,
      selectedCourse.description
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const keywords = [
      "math",
      "calc",
      "calculus",
      "algebra",
      "geometry",
      "trig",
      "trigonometry"
    ];
    return keywords.some((keyword) => haystack.includes(keyword));
  }, [selectedCourse]);

  const adminCourse = useMemo(() => {
    const courseId = adminCourseRosterId || selectedCourseId;
    return courses.find((course) => course.id === courseId);
  }, [courses, adminCourseRosterId, selectedCourseId]);

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

  const getCourseFlows = (courseId) => {
    if (!courseId) {
      return [];
    }
    return flows.filter((flow) => {
      if (flow.id.startsWith(`${courseId}-`)) {
        return true;
      }
      const course = courses.find((item) => item.id === courseId);
      return course?.active_flow_id === flow.id;
    });
  };

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

  const enrolledStudents = useMemo(
    () =>
      adminUsers.filter((student) => adminCourseStudentIds.includes(student.id)),
    [adminUsers, adminCourseStudentIds]
  );

  const studentQuizCards = useMemo(() => {
    const meta = [
      { duration: 45, questions: 25, due: "Feb 3, 2026", score: 92 },
      { duration: 30, questions: 20, due: "Feb 5, 2026" },
      { duration: 60, questions: 15, due: "Feb 8, 2026" },
      { duration: 40, questions: 18, due: "Feb 10, 2026" },
      { duration: 50, questions: 30, due: "Feb 12, 2026", score: 88 }
    ];
    return courseFlows.map((flow, index) => {
      const fallback = {
        duration: 30 + index * 5,
        questions: 10 + index * 5,
        due: "Feb 15, 2026"
      };
      return { flow, ...(meta[index] || fallback) };
    });
  }, [courseFlows]);

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
      setReturnView("catalog");
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
    setSelectedFlowId(course.active_flow_id || "");
    if (isAdmin) {
      setAdminCourseRosterId(course.id);
      setAdminTab("students");
      setViewMode("admin-course");
      return;
    }
    setViewMode("student-course");
  };

  const handleStudentStartQuiz = async (flowId) => {
    setError("");
    resetSessionView();
    try {
      const data = await startSession(flowId, studentId);
      setSessionId(data.session_id);
      setActiveFlow(data.flow);
      setCurrentStep(data.step);
      setResult(null);
      setStepStartTs(Date.now());
      setSelectedFlowId(flowId);
      setReturnView("student-course");
      setViewMode("runner");
    } catch (err) {
      setError(err.message);
    }
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
      setCourseStudentCounts((prev) => ({
        ...prev,
        [adminCourseRosterId]: assigned.length
      }));
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
      setCourseStudentCounts((prev) => ({
        ...prev,
        [adminCourseRosterId]: assigned.length
      }));
      setAdminRosterStatus("Roster updated.");
      setRosterEditMode(false);
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
    setRosterEditMode(false);
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
      {authChecked && authUser && viewMode === "runner" && (
        <header className="app-header">
          <div>
            <h1 className="app-title">Guided Learning Flow Engine</h1>
            <p className="app-subtitle">
              Guided practice with instant feedback and step tracking.
            </p>
          </div>
          <div className="user-chip">
            <span className="user-name">{authUser.username}</span>
            {isAdmin && <span className="user-role">Admin</span>}
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
          <section className="course-dashboard">
            <div className="catalog-topbar">
              <div className="brand-mark">
                <span className="brand-text">Candoo</span>
                <span className="brand-accent">Brandeis</span>
              </div>
              <div className="catalog-user">
                <span className="catalog-username">{authUser.username}</span>
                {isAdmin && <span className="admin-badge">★ Admin</span>}
                <button className="link-button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>
            <div className="catalog-header">
              <h2 className="catalog-title">My Courses</h2>
            </div>
            {error && <div className="course-note">Error: {error}</div>}
            {catalogNotice && (
              <div className="course-note">{catalogNotice}</div>
            )}
            <div className="course-grid">
              {visibleCourses.map((course, index) => {
                const coverHue = 210 + index * 35;
                return (
                  <button
                    key={course.id}
                    type="button"
                    className="course-card"
                    onClick={() => handleCourseSelect(course)}
                    disabled={!course.active_flow_id && !isAdmin}
                  >
                    <div
                      className="course-card-media"
                      style={{
                        background: `linear-gradient(135deg, hsl(${coverHue} 70% 80%), hsl(${coverHue} 60% 65%))`
                      }}
                    />
                    <div className="course-card-body">
                      <div className="course-card-header">
                        <div className="course-card-title">{course.name}</div>
                        <span className="course-card-menu">⋮</span>
                      </div>
                      <div className="course-card-subtitle">
                        {course.subtitle || course.description || "Click to manage course"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {visibleCourses.length === 0 && (
              <div className="course-note">No courses are available yet.</div>
            )}
          </section>
        )}

        {authChecked && authUser && viewMode === "admin-course" && isAdmin && (
          <section className="admin-course">
            <div className="page-toolbar">
              <button
                className="back-link"
                type="button"
                onClick={() => setViewMode("catalog")}
              >
                ← Back to Courses
              </button>
              <button className="link-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
            <div className="course-title-row">
              <h2 className="course-title-lg">{adminCourse?.name}</h2>
              <span className="course-code-pill">
                {adminCourse?.id?.toUpperCase()}
              </span>
            </div>
            <div className="course-switcher">
              <button
                className={
                  adminTab === "students"
                    ? "switcher-button active"
                    : "switcher-button"
                }
                type="button"
                onClick={() => setAdminTab("students")}
              >
                Students
              </button>
              <button
                className={
                  adminTab === "quizzes"
                    ? "switcher-button active"
                    : "switcher-button"
                }
                type="button"
                onClick={() => setAdminTab("quizzes")}
              >
                Quizzes
              </button>
            </div>

            {!adminTokenReady && (
              <div className="token-card">
                <div className="token-title">Admin access required</div>
                <form className="token-form" onSubmit={handleAdminAuth}>
                  <input
                    className="token-input"
                    type="password"
                    value={adminToken}
                    onChange={(event) => {
                      setAdminToken(event.target.value);
                      setAdminTokenReady(false);
                    }}
                    placeholder="Enter admin token"
                    required
                  />
                  <button className="token-button" type="submit">
                    Unlock
                  </button>
                </form>
              </div>
            )}

            {adminTab === "students" && (
              <div className="admin-panel-card">
                <div className="admin-panel-header">
                  <div className="admin-panel-title">
                    Enrolled Students
                    <span className="admin-count-pill">
                      {enrolledStudents.length}
                    </span>
                  </div>
                  <button
                    className="admin-action"
                    type="button"
                    onClick={() => {
                      setRosterEditMode(true);
                      handleAdminLoadRoster();
                    }}
                    disabled={!adminTokenReady}
                  >
                    Add Student
                  </button>
                </div>

                {adminRosterStatus && (
                  <div className="admin-status">{adminRosterStatus}</div>
                )}

                {rosterEditMode ? (
                  <div className="admin-edit">
                    <div className="admin-edit-actions">
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => {
                          setRosterEditMode(false);
                          handleAdminLoadRoster();
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="button-primary"
                        type="button"
                        onClick={handleAdminSaveRoster}
                      >
                        Save roster
                      </button>
                    </div>
                    <div className="student-list">
                      {adminUsers.length === 0 ? (
                        <div className="admin-empty">No students found.</div>
                      ) : (
                        adminUsers.map((student) => (
                          <label key={student.id} className="student-row">
                            <input
                              type="checkbox"
                              checked={adminCourseStudentIds.includes(student.id)}
                              onChange={() => toggleStudentAssignment(student.id)}
                            />
                            <div>
                              <div className="student-name">
                                {student.username}
                              </div>
                              <div className="student-email">
                                {student.email || "no email"}
                              </div>
                            </div>
                            {adminEmails.includes(
                              (student.email || "").toLowerCase()
                            ) && <span className="student-badge">Admin</span>}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="student-list">
                    {enrolledStudents.length === 0 ? (
                      <div className="admin-empty">No students assigned yet.</div>
                    ) : (
                      enrolledStudents.map((student) => (
                        <div key={student.id} className="student-row">
                          <div>
                            <div className="student-name">
                              {student.username}
                            </div>
                            <div className="student-email">
                              {student.email || "no email"}
                            </div>
                          </div>
                          {adminEmails.includes(
                            (student.email || "").toLowerCase()
                          ) && <span className="student-badge">Admin</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {adminTab === "quizzes" && (
              <div className="admin-panel-card">
                <div className="admin-panel-header">
                  <div className="admin-panel-title">Published Quizzes</div>
                </div>
                <div className="quiz-list">
                  {courseFlows.length === 0 ? (
                    <div className="admin-empty">No quizzes published yet.</div>
                  ) : (
                    courseFlows.map((flow) => (
                      <div key={flow.id} className="quiz-row">
                        <div className="quiz-title">{flow.title}</div>
                        <button className="quiz-button" type="button">
                          View Reports
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {authChecked && authUser && viewMode === "student-course" && (
          <section className="student-course">
            <div className="page-toolbar">
              <button
                className="back-link"
                type="button"
                onClick={() => setViewMode("catalog")}
              >
                ← Back to Courses
              </button>
              <button className="link-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
            <div className="course-title-row">
              <h2 className="course-title-lg">{selectedCourse?.name}</h2>
              <span className="course-code-pill">
                {selectedCourse?.id?.toUpperCase()}
              </span>
            </div>
            <div className="course-subheader">Available Quizzes</div>
            {error && <div className="course-note">Error: {error}</div>}
            <div className="student-quiz-list">
              {studentQuizCards.length === 0 ? (
                <div className="admin-empty">No quizzes available yet.</div>
              ) : (
                studentQuizCards.map((quiz, index) => (
                  <div key={quiz.flow.id} className="student-quiz-card">
                    <div className="quiz-left">
                      <div
                        className={
                          quiz.score
                            ? "quiz-status complete"
                            : "quiz-status"
                        }
                      >
                        {quiz.score ? "✓" : ""}
                      </div>
                      <div>
                        <div className="quiz-title">{quiz.flow.title}</div>
                        <div className="quiz-meta">
                          <span>⏱ {quiz.duration} min</span>
                          <span>•</span>
                          <span>{quiz.questions} questions</span>
                          <span>•</span>
                          <span className={quiz.score ? "" : "quiz-due"}>
                            Due {quiz.due}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="quiz-right">
                      {quiz.score ? (
                        <>
                          <div className="quiz-score">
                            <div className="quiz-score-value">
                              {quiz.score}%
                            </div>
                            <div className="quiz-score-label">Score</div>
                          </div>
                          <button
                            className="quiz-review"
                            type="button"
                            onClick={() => handleStudentStartQuiz(quiz.flow.id)}
                          >
                            Review
                          </button>
                        </>
                      ) : (
                        <button
                          className="quiz-start"
                          type="button"
                          onClick={() => handleStudentStartQuiz(quiz.flow.id)}
                        >
                          Start Quiz
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
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
                onClick={() => setViewMode(returnView)}
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
                    showMathKeyboard={isMathCourse}
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
