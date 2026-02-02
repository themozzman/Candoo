import React, { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import {
  adminApproveFlow,
  adminApproveSpec,
  adminCourseStudents,
  adminCreateUsers,
  adminDeleteUser,
  adminGenerateSpec,
  adminListUsers,
  adminPreviewFlow,
  adminSetCourseStudents,
  advanceSession,
  analyzeAttempts,
  fetchCourses,
  fetchFlows,
  fetchMe,
  fetchReport,
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
import MathPrompt from "./components/MathPrompt.jsx";

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
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentUsername, setNewStudentUsername] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [pendingStudents, setPendingStudents] = useState([]);
  const [previewFlow, setPreviewFlow] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState("");
  const [reportData, setReportData] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [reportMeta, setReportMeta] = useState(null);
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
  const [questionIndex, setQuestionIndex] = useState(1);
  const [totalSteps, setTotalSteps] = useState(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [pendingNextStep, setPendingNextStep] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [finishReady, setFinishReady] = useState(false);
  const [error, setError] = useState("");
  const [stepStartTs, setStepStartTs] = useState(null);
  const [returnView, setReturnView] = useState("catalog");
  const advanceTimerRef = useRef(null);
  const flowsPollRef = useRef(null);
  const [debugPreviewJson, setDebugPreviewJson] = useState("");
  const [debugPreviewError, setDebugPreviewError] = useState("");
  const [debugPreviewSteps, setDebugPreviewSteps] = useState([]);

  const debugPreviewEnabled =
    import.meta.env.DEV || import.meta.env.VITE_DEBUG_PREVIEW === "true";

  const isAdmin = Boolean(authUser?.is_admin);

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

  const stopFlowsPolling = () => {
    if (flowsPollRef.current) {
      clearInterval(flowsPollRef.current);
      flowsPollRef.current = null;
    }
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
    if (!isAdmin || viewMode !== "admin-course" || adminTab !== "quizzes") {
      stopFlowsPolling();
      return;
    }
    stopFlowsPolling();
    flowsPollRef.current = window.setInterval(() => {
      loadFlows();
    }, 8000);
    return () => stopFlowsPolling();
  }, [isAdmin, viewMode, adminTab]);

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
    if (!isAdmin || viewMode !== "admin-course" || !rosterEditMode) {
      return;
    }
    adminListUsers(adminToken || "")
      .then((data) => setAdminUsers(data.users || []))
      .catch((err) => setAdminRosterStatus(err.message));
  }, [isAdmin, viewMode, rosterEditMode, adminToken]);

  useEffect(() => {
    if (!isAdmin || viewMode !== "admin-course" || !adminCourseRosterId) {
      return;
    }
    handleAdminLoadRoster();
  }, [isAdmin, viewMode, adminCourseRosterId]);

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

  const formatPercent = (value, digits = 0) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "0%";
    }
    return `${(value * 100).toFixed(digits)}%`;
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
    setQuestionIndex(1);
    setTotalSteps(null);
    setIsAdvancing(false);
    setPendingNextStep(null);
    setAnalysisLoading(false);
    setFinishReady(false);
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  const handleStart = async () => {
    setError("");
    resetSessionView();
    try {
      const data = await startSession(selectedFlowId, studentId);
      setSessionId(data.session_id);
      setActiveFlow(data.flow);
      setTotalSteps(data.flow?.total_steps || null);
      setCurrentStep(data.step);
      setResult(null);
      setStepStartTs(Date.now());
      setQuestionIndex(1);
      setIsAdvancing(false);
      setFinishReady(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (response, skipped = false) => {
    if (!sessionId || !currentStep || isAdvancing) {
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
      setAnalysisLoading(false);
      if (data.skipped && data.next_step) {
        if (data.next_step.id !== currentStep.id) {
          setQuestionIndex((prev) => prev + 1);
        }
        setCurrentStep(data.next_step);
        setStepStartTs(Date.now());
        setResult(null);
        setPendingNextStep(null);
        setFinishReady(false);
        return;
      }
      const nextStep = data.next_step;
      const revealNextStep = data.revealNextStep;
      const advance = () => {
        if (nextStep) {
          if (nextStep.id !== currentStep.id) {
            setQuestionIndex((prev) => prev + 1);
          }
          setCurrentStep(nextStep);
          setStepStartTs(Date.now());
        } else {
          setCurrentStep(null);
          setStepStartTs(null);
        }
        setResult(null);
        setIsAdvancing(false);
        setPendingNextStep(null);
        setFinishReady(false);
        if (advanceTimerRef.current) {
          clearTimeout(advanceTimerRef.current);
          advanceTimerRef.current = null;
        }
      };
      if (data.correct) {
        if (nextStep && nextStep.id !== currentStep.id) {
          setIsAdvancing(true);
          setPendingNextStep(nextStep);
          advanceTimerRef.current = window.setTimeout(advance, 3000);
        } else if (nextStep) {
          setCurrentStep(nextStep);
          setStepStartTs(Date.now());
          setFinishReady(false);
        } else {
          setFinishReady(true);
          setPendingNextStep(null);
        }
      } else if (data.reveal) {
        if (revealNextStep) {
          setPendingNextStep(revealNextStep);
          setFinishReady(false);
        } else {
          setFinishReady(true);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!result?.analysisPending || !sessionId || !currentStep) {
      return;
    }
    setAnalysisLoading(true);
    analyzeAttempts(sessionId, currentStep.id)
      .then((data) => {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                analysisPending: false,
                correctionHelp: data.correctionHelp || []
              }
            : prev
        );
      })
      .catch(() => {
        setResult((prev) =>
          prev ? { ...prev, analysisPending: false, correctionHelp: [] } : prev
        );
      })
      .finally(() => setAnalysisLoading(false));
  }, [result?.analysisPending, sessionId, currentStep?.id]);

  const handleAdvanceNow = () => {
    if (!pendingNextStep || !currentStep || !sessionId) {
      return;
    }
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setIsAdvancing(true);
    const nextStep = pendingNextStep;
    advanceSession(sessionId, nextStep.id)
      .then(() => {
        if (nextStep.id !== currentStep.id) {
          setQuestionIndex((prev) => prev + 1);
        }
        setCurrentStep(nextStep);
        setStepStartTs(Date.now());
        setResult(null);
        setPendingNextStep(null);
        setFinishReady(false);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsAdvancing(false));
  };

  const handleFinishQuiz = () => {
    if (!sessionId) {
      return;
    }
    advanceSession(sessionId, null)
      .then(() => {
        setCurrentStep(null);
        setStepStartTs(null);
        setResult(null);
        setPendingNextStep(null);
        setFinishReady(false);
      })
      .catch((err) => setError(err.message));
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

  const parseDebugPreview = () => {
    setDebugPreviewError("");
    if (!debugPreviewJson.trim()) {
      setDebugPreviewSteps([]);
      return;
    }
    try {
      const data = JSON.parse(debugPreviewJson);
      const stepsRaw = data?.steps || data?.flow?.steps || data;
      let stepsList = [];
      if (Array.isArray(stepsRaw)) {
        stepsList = stepsRaw;
      } else if (stepsRaw && typeof stepsRaw === "object") {
        stepsList = Object.values(stepsRaw);
      }
      setDebugPreviewSteps(stepsList);
    } catch (err) {
      setDebugPreviewError(err.message);
      setDebugPreviewSteps([]);
    }
  };

  const handleAdminLoadRoster = async () => {
    if (!adminCourseRosterId) {
      setAdminRosterStatus("Select a course to manage.");
      return;
    }
    setAdminRosterStatus("");
    try {
      const data = await adminCourseStudents(adminToken || "", adminCourseRosterId);
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
      let nextStudentIds = adminCourseStudentIds;
      if (pendingStudents.length > 0) {
        await adminCreateUsers(adminToken || "", pendingStudents);
        const usersData = await adminListUsers(adminToken || "");
        setAdminUsers(usersData.users || []);
        const createdIds = (usersData.users || [])
          .filter((user) =>
            pendingStudents.some(
              (pending) =>
                pending.username === user.username ||
                (pending.email || "").toLowerCase() ===
                  (user.email || "").toLowerCase()
            )
          )
          .map((user) => user.id);
        nextStudentIds = Array.from(
          new Set([...adminCourseStudentIds, ...createdIds])
        );
        setAdminCourseStudentIds(nextStudentIds);
        setPendingStudents([]);
        setNewStudentEmail("");
        setNewStudentUsername("");
        setNewStudentPassword("");
      }
      const data = await adminSetCourseStudents(
        adminToken || "",
        adminCourseRosterId,
        nextStudentIds
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

  const handleAddPendingStudent = () => {
    setAdminRosterStatus("");
    if (!newStudentEmail || !newStudentUsername || !newStudentPassword) {
      setAdminRosterStatus("Enter email, username, and password.");
      return;
    }
    setPendingStudents((prev) => [
      ...prev,
      {
        email: newStudentEmail.trim(),
        username: newStudentUsername.trim(),
        password: newStudentPassword
      }
    ]);
    setNewStudentEmail("");
    setNewStudentUsername("");
    setNewStudentPassword("");
  };

  const handlePreviewFlow = async (flowId) => {
    setPreviewStatus("");
    try {
      const data = await adminPreviewFlow(adminToken || "", flowId);
      setPreviewFlow(data.flow);
      setPreviewOpen(true);
    } catch (err) {
      setPreviewStatus(err.message);
    }
  };

  const handleViewReport = async (flow) => {
    setReportStatus("");
    setReportData(null);
    setReportMeta({ id: flow.id, title: flow.title });
    try {
      const data = await fetchReport(flow.id);
      setReportData(data);
      setReportOpen(true);
    } catch (err) {
      setReportStatus(err.message);
    }
  };

  const handleAdminDeleteUser = async (username) => {
    if (!username) {
      return;
    }
    const confirmDelete = window.confirm(
      `Delete ${username}? This removes their enrollments and account.`
    );
    if (!confirmDelete) {
      return;
    }
    setAdminRosterStatus("");
    try {
      await adminDeleteUser(adminToken || "", username);
      await handleAdminLoadRoster();
      const usersData = await adminListUsers(adminToken || "");
      setAdminUsers(usersData.users || []);
      setAdminRosterStatus(`${username} deleted.`);
    } catch (err) {
      setAdminRosterStatus(err.message);
    }
  };

  const reportSummary = reportData?.summary_by_step || [];
  const reportStudents = reportData?.students || [];
  const reportBottlenecks = reportData?.bottlenecks || [];
  const reportWrongSamples = reportData?.wrong_response_samples || {};
  const totalAttempts = reportSummary.reduce(
    (sum, step) => sum + (step.attempts || 0),
    0
  );
  const totalCorrect = reportSummary.reduce(
    (sum, step) => sum + (step.correct_count || 0),
    0
  );
  const totalWrong = reportSummary.reduce(
    (sum, step) => sum + (step.wrong_count || 0),
    0
  );
  const totalSkipped = reportSummary.reduce(
    (sum, step) => sum + (step.skip_count || 0),
    0
  );
  const avgCompletion = reportStudents.length
    ? reportStudents.reduce(
        (sum, student) => sum + (student.completion_rate || 0),
        0
      ) / reportStudents.length
    : 0;
  const attemptValues = reportStudents
    .map((student) => student.avg_attempts_per_step)
    .filter((value) => value !== null && value !== undefined);
  const avgAttemptsPerStep = attemptValues.length
    ? attemptValues.reduce((sum, value) => sum + value, 0) / attemptValues.length
    : 0;
  const limitedReportData = totalAttempts > 0 && totalAttempts < 5;

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
        <header className="app-header runner-toolbar">
          <button
            className="back-link"
            type="button"
            onClick={() => setViewMode(returnView)}
          >
            ← Back to courses
          </button>
          {activeFlow?.title && (
            <div className="runner-title">{activeFlow.title}</div>
          )}
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
                  >
                    Add Student
                  </button>
                </div>

                {adminRosterStatus && (
                  <div className="admin-status">{adminRosterStatus}</div>
                )}

                {rosterEditMode ? (
                  <div className="admin-edit">
                    <div className="admin-block">
                      <div className="admin-title">Add new student</div>
                      <div className="admin-form">
                        <div className="form-field">
                          <label className="form-label">Email</label>
                          <input
                            className="form-input"
                            type="email"
                            value={newStudentEmail}
                            onChange={(event) => setNewStudentEmail(event.target.value)}
                            placeholder="name@example.com"
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Username</label>
                          <input
                            className="form-input"
                            type="text"
                            value={newStudentUsername}
                            onChange={(event) => setNewStudentUsername(event.target.value)}
                            placeholder="username"
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">Password</label>
                          <input
                            className="form-input"
                            type="password"
                            value={newStudentPassword}
                            onChange={(event) => setNewStudentPassword(event.target.value)}
                            placeholder="temporary password"
                          />
                        </div>
                        <div className="form-field">
                          <label className="form-label">&nbsp;</label>
                          <button
                            className="button-secondary"
                            type="button"
                            onClick={handleAddPendingStudent}
                          >
                            Add student
                          </button>
                        </div>
                      </div>
                      {pendingStudents.length > 0 && (
                        <div className="pending-students">
                          {pendingStudents.map((student, index) => (
                            <div key={`${student.email}-${index}`} className="pending-row">
                              <span>{student.username}</span>
                              <span className="pending-email">{student.email}</span>
                              <button
                                className="link-button"
                                type="button"
                                onClick={() =>
                                  setPendingStudents((prev) =>
                                    prev.filter((_, idx) => idx !== index)
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                        adminUsers.map((student) => {
                          const isSelf = student.username === authUser?.username;
                          return (
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
                              <div className="student-actions">
                                {student.is_admin && (
                                  <span className="student-badge">Admin</span>
                                )}
                                <button
                                  className="student-delete"
                                  type="button"
                                  onClick={() => handleAdminDeleteUser(student.username)}
                                  disabled={isSelf}
                                  title={
                                    isSelf
                                      ? "You cannot delete your own account."
                                      : "Delete user"
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            </label>
                          );
                        })
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
                          {student.is_admin && (
                            <span className="student-badge">Admin</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {adminTab === "quizzes" && (
              <div className="admin-panel-stack">
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
                          <div className="quiz-actions">
                            <button
                              className="quiz-button"
                              type="button"
                              onClick={() => handlePreviewFlow(flow.id)}
                            >
                              Preview
                            </button>
                            <button
                              className="quiz-button"
                              type="button"
                              onClick={() => handleViewReport(flow)}
                            >
                              View Reports
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="admin-panel-card">
                  <div className="admin-panel-header">
                    <div className="admin-panel-title">Generate New Quiz</div>
                  </div>
                  <div className="admin-panel-body">
                    {!adminTokenReady ? (
                      <div className="token-card">
                        <div className="token-title">Flow token required</div>
                        <form className="token-form" onSubmit={handleAdminAuth}>
                          <input
                            className="token-input"
                            type="password"
                            value={adminToken}
                            onChange={(event) => {
                              setAdminToken(event.target.value);
                              setAdminTokenReady(false);
                            }}
                            placeholder="Enter flow token"
                            required
                          />
                          <button className="token-button" type="submit">
                            Unlock
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="admin-block">
                        <form className="admin-form" onSubmit={handleAdminGenerateSpec}>
                          <div className="form-field">
                            <label className="form-label">Course</label>
                            <select
                              className="form-select"
                              value={adminCourseId || selectedCourseId}
                              onChange={(event) => setAdminCourseId(event.target.value)}
                            >
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
                              placeholder="e.g. Trigonometric derivatives"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label className="form-label">&nbsp;</label>
                            <button className="button-primary" type="submit">
                              Generate spec
                            </button>
                          </div>
                        </form>

                        {adminStatus && <div className="admin-status">{adminStatus}</div>}

                        {adminSpecId && (
                          <div className="admin-block">
                            <div className="admin-title">Spec JSON</div>
                            <textarea
                              className="admin-textarea"
                              rows={8}
                              value={adminSpecText}
                              onChange={(event) => setAdminSpecText(event.target.value)}
                            />
                            <button
                              className="button-secondary"
                              type="button"
                              onClick={handleAdminApproveSpec}
                            >
                              Approve spec → Generate flow
                            </button>
                          </div>
                        )}

                        {adminFlowId && (
                          <div className="admin-block">
                            <div className="admin-title">Flow JSON</div>
                            <textarea
                              className="admin-textarea"
                              rows={10}
                              value={adminFlowText}
                              onChange={(event) => setAdminFlowText(event.target.value)}
                            />
                            <button
                              className="button-primary"
                              type="button"
                              onClick={handleAdminApproveFlow}
                            >
                              Publish quiz
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {debugPreviewEnabled && (
                  <div className="admin-panel-card">
                    <div className="admin-panel-header">
                      <div className="admin-panel-title">Debug Preview</div>
                    </div>
                    <div className="admin-panel-body">
                      <textarea
                        className="admin-textarea"
                        rows={8}
                        value={debugPreviewJson}
                        onChange={(event) => setDebugPreviewJson(event.target.value)}
                        placeholder="Paste flow JSON or steps array"
                      />
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={parseDebugPreview}
                      >
                        Render preview
                      </button>
                      {debugPreviewError && (
                        <div className="admin-status">{debugPreviewError}</div>
                      )}
                      {debugPreviewSteps.length > 0 && (
                        <div className="preview-list">
                          {debugPreviewSteps.map((step, index) => (
                            <div key={step.id || index} className="preview-item">
                              <div className="preview-step-title">
                                Question {index + 1}
                                <span className="preview-step-type">{step.type}</span>
                              </div>
                              <MathPrompt
                                prompt={step.prompt}
                                promptText={step.prompt_text}
                                promptMath={step.prompt_math}
                              />
                              {step.type === "MC" ? (
                                <div className="preview-options">
                                  {(step.options || []).map((option, optIndex) => {
                                    const optionValue =
                                      option && typeof option === "object"
                                        ? option.value
                                        : option;
                                    const optionLabel =
                                      option && typeof option === "object"
                                        ? option.text || option.math || option.value || ""
                                        : optionValue;
                                    return (
                                      <div
                                        key={optionValue || optIndex}
                                        className="preview-option"
                                      >
                                        {optionLabel}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="preview-short-answer">Short answer</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
            <div className="card runner-step">
              {currentStep ? (
                <>
                  <div className="runner-step-header">
                    <div className="runner-step-label">
                      Question {questionIndex}
                      {totalSteps ? ` of ${totalSteps}` : ""}
                    </div>
                    <span className="runner-step-badge">{currentStep.type}</span>
                  </div>
                  {totalSteps && (
                    <div className="runner-progress">
                      <div
                        className="runner-progress-bar"
                        style={{
                          width: `${Math.min(
                            (questionIndex / totalSteps) * 100,
                            100
                          )}%`
                        }}
                      />
                    </div>
                  )}
                  {currentStep.type === "MC" ? (
                    <MCStep
                      key={currentStep.id}
                      step={currentStep}
                      onAnswer={(value) => handleSubmit(value, false)}
                      onSkip={() => handleSubmit("", true)}
                      disabled={isAdvancing}
                      hideSkip={Boolean(result?.reveal)}
                      hideSubmit={Boolean(result?.reveal)}
                    />
                  ) : (
                    <SAStep
                      key={currentStep.id}
                      step={currentStep}
                      onAnswer={(value) => handleSubmit(value, false)}
                      onSkip={() => handleSubmit("", true)}
                      showMathKeyboard={isMathCourse}
                      disabled={isAdvancing}
                      forceHideKeyboard={Boolean(result?.reveal)}
                      hideSkip={Boolean(result?.reveal)}
                      hideSubmit={Boolean(result?.reveal)}
                    />
                  )}
                  <Feedback
                    result={result}
                    solution={currentStep.solution}
                    analysisLoading={analysisLoading}
                    showAttemptAnalysis={currentStep.type === "SA"}
                  />
                  {pendingNextStep && (
                    <button
                      className="button-ghost runner-next"
                      type="button"
                      onClick={handleAdvanceNow}
                    >
                      Next question →
                    </button>
                  )}
                  {finishReady && result && !result.next_step && (result.correct || result.reveal) && (
                    <button
                      className="button-ghost runner-next"
                      type="button"
                      onClick={handleFinishQuiz}
                    >
                      Finish Quiz →
                    </button>
                  )}
                </>
              ) : sessionId ? (
                <div className="session-complete">
                  Session completed. Start a new session to try again.
                </div>
              ) : (
                <div className="session-empty">
                  Start a session to load the first question.
                </div>
              )}
            </div>
          </section>
        )}

        {previewOpen && previewFlow && (
          <div className="preview-overlay" onClick={() => setPreviewOpen(false)}>
            <div
              className="preview-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="preview-header">
                <div>
                  <div className="preview-title">{previewFlow.title}</div>
                  {previewFlow.statement && (
                    <div className="preview-subtitle">{previewFlow.statement}</div>
                  )}
                </div>
                <button
                  className="preview-close"
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="preview-list">
                {previewFlow.steps.map((step, index) => (
                  <div key={step.id} className="preview-item">
                    <div className="preview-step-title">
                      Question {index + 1}
                      <span className="preview-step-type">{step.type}</span>
                    </div>
                    <MathPrompt
                      prompt={step.prompt}
                      promptText={step.prompt_text}
                      promptMath={step.prompt_math}
                    />
                    {step.type === "MC" ? (
                      <div className="preview-options">
                        {step.options.map((option) => {
                          const optionValue =
                            option && typeof option === "object" ? option.value : option;
                          const optionLabel =
                            option && typeof option === "object"
                              ? option.text || option.math || option.value || ""
                              : optionValue;
                          return (
                            <div key={optionValue} className="preview-option">
                              {optionLabel}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="preview-short-answer">Short answer</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {reportOpen && reportData && (
          <div className="report-overlay" onClick={() => setReportOpen(false)}>
            <div
              className="report-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="report-header">
                <div>
                  <div className="report-title">
                    {reportMeta?.title || "Quiz report"}
                  </div>
                  <div className="report-subtitle">
                    {reportMeta?.id || reportData.flow_id}
                  </div>
                </div>
                <button
                  className="report-close"
                  type="button"
                  onClick={() => setReportOpen(false)}
                >
                  Close
                </button>
              </div>

              <div className="report-body">
                <div className="report-summary">
                  <div className="report-stat">
                    <div className="report-stat-label">Avg accuracy</div>
                    <div className="report-stat-value">
                      {formatPercent(
                        totalAttempts ? totalCorrect / totalAttempts : 0,
                        0
                      )}
                    </div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-label">Completion</div>
                    <div className="report-stat-value">
                      {formatPercent(avgCompletion, 0)}
                    </div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-label">Avg attempts/step</div>
                    <div className="report-stat-value">
                      {avgAttemptsPerStep ? avgAttemptsPerStep.toFixed(1) : "0.0"}
                    </div>
                  </div>
                  <div className="report-stat">
                    <div className="report-stat-label">Total attempts</div>
                    <div className="report-stat-value">{totalAttempts}</div>
                  </div>
                </div>

                {totalAttempts === 0 && (
                  <div className="report-empty">
                    No attempts yet. Reports will populate once students submit.
                  </div>
                )}

                {limitedReportData && (
                  <div className="report-note">
                    Limited data so far. Metrics will stabilize with more attempts.
                  </div>
                )}

                <div className="report-section">
                  <div className="report-section-title">Bottlenecks</div>
                  {reportBottlenecks.length === 0 ? (
                    <div className="report-empty">No bottlenecks yet.</div>
                  ) : (
                    <div className="report-bottlenecks">
                      {reportBottlenecks.map((item) => (
                        <div key={item.step_id} className="report-bottleneck">
                          <div className="report-bottleneck-title">
                            {item.prompt || item.step_id}
                          </div>
                          <div className="report-bottleneck-metric">
                            Wrong: {formatPercent(item.wrong_rate, 0)} | Skip:{" "}
                            {formatPercent(item.skip_rate, 0)} | Attempts:{" "}
                            {item.attempts}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="report-section">
                  <div className="report-section-title">Question breakdown</div>
                  <div className="report-questions">
                    {reportSummary.map((step) => {
                      const wrongSamples = reportWrongSamples[step.step_id] || [];
                      return (
                        <div key={step.step_id} className="report-question-card">
                          <div className="report-question-title">
                            {step.step_id}
                          </div>
                          <MathPrompt
                            prompt={step.prompt}
                            promptText={step.prompt_text}
                            promptMath={step.prompt_math}
                          />
                          <div className="report-question-stats">
                            <div>
                              Attempts: {step.attempts} | Correct:{" "}
                              {step.correct_count} | Wrong: {step.wrong_count} |
                              Skipped: {step.skip_count}
                            </div>
                            <div>
                              Wrong rate: {formatPercent(step.wrong_rate, 0)} |
                              Skip rate: {formatPercent(step.skip_rate, 0)} |
                              Avg attempts to correct:{" "}
                              {step.avg_attempts_before_correct
                                ? step.avg_attempts_before_correct.toFixed(1)
                                : "-"}
                            </div>
                          </div>
                          {wrongSamples.length > 0 && (
                            <div className="report-wrong-answers">
                              <div className="report-wrong-title">
                                Common wrong answers
                              </div>
                              <div className="report-wrong-list">
                                {wrongSamples.map((sample) => (
                                  <div
                                    key={`${step.step_id}-${sample.response}`}
                                    className="report-wrong-item"
                                  >
                                    <span>{sample.response}</span>
                                    <span>{sample.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="report-section">
                  <div className="report-section-title">Students</div>
                  {reportStudents.length === 0 ? (
                    <div className="report-empty">No student attempts yet.</div>
                  ) : (
                    <div className="report-students">
                      {reportStudents.map((student) => (
                        <div key={student.student_id} className="report-student-row">
                          <div className="report-student-name">
                            {student.student_id}
                          </div>
                          <div className="report-student-metrics">
                            Completion: {formatPercent(student.completion_rate, 0)} |
                            Wrong: {formatPercent(student.wrong_rate, 0)} | Skipped:{" "}
                            {formatPercent(student.skip_rate, 0)} | Attempts:{" "}
                            {student.attempts}
                          </div>
                          {student.at_risk && (
                            <span className="report-student-flag">At risk</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {previewStatus && <div className="course-note">{previewStatus}</div>}
        {reportStatus && <div className="course-note">{reportStatus}</div>}
      </main>
    </div>
  );
}
