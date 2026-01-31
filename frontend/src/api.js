const API_BASE = import.meta.env.VITE_API_BASE || "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options
  });

  if (!response.ok) {
    let detail = "Request failed";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(detail);
  }

  return response.json();
}

export function fetchFlows() {
  return request("/flows");
}

export function fetchCourses() {
  return request("/courses");
}

export function startSession(flowId, studentId) {
  return request("/session/start", {
    method: "POST",
    body: JSON.stringify({ flow_id: flowId, student_id: studentId })
  });
}

export function submitAnswer(sessionId, payload) {
  return request(`/session/${sessionId}/submit`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function analyzeAttempts(sessionId, stepId) {
  return request(`/session/${sessionId}/analysis`, {
    method: "POST",
    body: JSON.stringify({ step_id: stepId })
  });
}

export function advanceSession(sessionId, nextStepId) {
  return request(`/session/${sessionId}/advance`, {
    method: "POST",
    body: JSON.stringify({ next_step_id: nextStepId })
  });
}

export function fetchReport(flowId) {
  return request(`/teacher/report?flow_id=${encodeURIComponent(flowId)}`);
}

export function signup(username, password) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}


export function requestPasswordReset(email) {
  return request("/auth/forgot", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPassword(token, newPassword) {
  return request("/auth/reset", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword })
  });
}


export function logout() {
  return request("/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return request("/auth/me");
}

export function adminGenerateSpec(token, topic, courseId) {
  return request("/admin/ai/spec", {
    method: "POST",
    body: JSON.stringify({ token, topic, course_id: courseId })
  });
}

export function adminApproveSpec(token, specId, specOverride) {
  return request("/admin/ai/spec/approve", {
    method: "POST",
    body: JSON.stringify({ token, spec_id: specId, spec_override: specOverride || null })
  });
}

export function adminApproveFlow(token, flowId) {
  return request("/admin/ai/flow/approve", {
    method: "POST",
    body: JSON.stringify({ token, flow_id: flowId })
  });
}

export function adminPreviewFlow(token, flowId) {
  return request("/admin/flows/preview", {
    method: "POST",
    body: JSON.stringify({ token, flow_id: flowId })
  });
}

export function adminListUsers(token) {
  return request("/admin/users/list", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function adminCourseStudents(token, courseId) {
  return request("/admin/courses/students", {
    method: "POST",
    body: JSON.stringify({ token, course_id: courseId })
  });
}

export function adminSetCourseStudents(token, courseId, studentIds) {
  return request("/admin/courses/students/set", {
    method: "POST",
    body: JSON.stringify({ token, course_id: courseId, student_ids: studentIds })
  });
}

export function adminCreateUsers(token, users) {
  return request("/admin/users/bulk", {
    method: "POST",
    body: JSON.stringify({ token, users })
  });
}

export function adminDeleteUser(token, username) {
  return request("/admin/users/delete", {
    method: "POST",
    body: JSON.stringify({ token, username })
  });
}
