const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

// NOTE: sessionStorage is used here for demo simplicity. For production, prefer
// httpOnly, Secure, SameSite cookies issued by the API so the JWT is never
// reachable from JavaScript (mitigates XSS token theft).
export const tokenStore = {
  get(key: "lecturerToken" | "studentToken"): string | null {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(key);
  },
  set(key: "lecturerToken" | "studentToken", value: string) {
    window.sessionStorage.setItem(key, value);
  },
  clear(key: "lecturerToken" | "studentToken") {
    window.sessionStorage.removeItem(key);
  },
};

export const api = {
  lecturerLogin: (email: string, password: string) =>
    request<{ token: string }>("/api/auth/lecturer/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  lecturerRegister: (name: string, email: string, password: string) =>
    request<{ token: string }>("/api/auth/lecturer/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  createTest: (token: string, payload: Record<string, unknown>) =>
    request<{ test: { id: string; linkToken: string; title: string; status: string }; accessCode: string | null }>(
      "/api/tests",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  uploadRoster: async (token: string, testId: string, file: File) => {
    const form = new FormData();
    form.append("roster", file);
    const res = await fetch(`${API_BASE}/api/tests/${testId}/roster`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body as { acceptedCount: number; rejectedCount: number; rejectedReasons: string[] };
  },

    getMe: (token: string) =>
    request<{ id: string; name: string; email: string; createdAt: string }>("/api/auth/lecturer/me", {}, token),

  listMyTests: (token: string) =>
    request<{
      tests: {
        id: string;
        title: string;
        status: string;
        window: "opened" | "closed";
        linkToken: string;
        rosterCount: number;
        createdAt: string;
      }[];
    }>("/api/tests", {}, token),

  regenerateAccessCode: (token: string, testId: string) =>
    request<{ accessCode: string }>(`/api/tests/${testId}/access-code/regenerate`, { method: "POST" }, token),

  generateQuestions: (token: string, testId: string) =>
    request<{ count: number; note: string }>(`/api/tests/${testId}/generate-questions`, { method: "POST" }, token),

  listQuestions: (token: string, testId: string) =>
    request<{
      questions: {
        id: string;
        text: string;
        options: string[];
        correctOptionIndex: number;
        topic: string;
        approved: boolean;
      }[];
    }>(`/api/tests/${testId}/questions`, {}, token),

  addManualQuestion: (
    token: string,
    testId: string,
    payload: { text: string; options: string[]; correctOptionIndex: number; topic: string }
  ) =>
    request<{ id: string }>(
      `/api/tests/${testId}/questions/manual`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  approveQuestions: (token: string, testId: string, approvedQuestionIds: string[]) =>
    request<{ ok: boolean }>(
      `/api/tests/${testId}/questions`,
      { method: "PATCH", body: JSON.stringify({ approvedQuestionIds }) },
      token
    ),

  generateLink: (token: string, testId: string) =>
    request<{ linkToken: string; status: string }>(`/api/tests/${testId}/link`, { method: "POST" }, token),

  liveResults: (token: string, testId: string) =>
    request<{ results: { idNumber: string; status: string; score: number | null }[] }>(
      `/api/tests/${testId}/results`,
      {},
      token
    ),

  studentLogin: (linkToken: string, idNumber: string, accessCode?: string) =>
    request<{ token: string; testId: string; durationMinutes: number }>("/api/auth/student/login", {
      method: "POST",
      body: JSON.stringify({ linkToken, idNumber, accessCode }),
    }),

  startAttempt: (token: string, linkToken: string) =>
    request<{ attemptId: string; deadline: string; status: string }>(
      `/api/attempts/${linkToken}/start`,
      { method: "POST" },
      token
    ),

  getQuestions: (token: string, linkToken: string) =>
    request<{ deadline: string; questions: { id: string; text: string; options: string[] }[] }>(
      `/api/attempts/${linkToken}/questions`,
      {},
      token
    ),

  saveAnswer: (token: string, linkToken: string, questionId: string, selectedOptionIndex: number) =>
    request<{ ok: boolean }>(
      `/api/attempts/${linkToken}/answer`,
      { method: "POST", body: JSON.stringify({ questionId, selectedOptionIndex }) },
      token
    ),

  heartbeat: (token: string, linkToken: string, visibility?: string) =>
    request<{ status: string; reason?: string }>(
      `/api/attempts/${linkToken}/heartbeat`,
      { method: "POST", body: JSON.stringify({ visibility }) },
      token
    ),

  submit: (token: string, linkToken: string) =>
    request<{ status: string; score: number | null }>(
      `/api/attempts/${linkToken}/submit`,
      { method: "POST" },
      token
    ),
};
