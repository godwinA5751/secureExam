const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = RequestInit & {
  /** Set true for login/register, where a 401 means "wrong credentials", not "session expired". */
  skipAuthRedirect?: boolean;
};

function redirectToLogin(): Promise<never> {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/lecturer/login")) {
    window.location.href = "/lecturer/login";
  }
  // Never resolves: the page is navigating away, so callers don't flash an error first.
  return new Promise<never>(() => {});
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRedirect, ...fetchOptions } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: "include", // sends the httpOnly cookie
    headers: {
      "Content-Type": "application/json",
      ...(fetchOptions.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Student calls (/api/attempts) are excluded: an expired student session mid-test
    // should show the "submitted" screen, not bounce to the lecturer login.
    const isStudentCall = path.startsWith("/api/attempts") || path.startsWith("/api/auth/student");
    if (res.status === 401 && !skipAuthRedirect && !isStudentCall) {
      return redirectToLogin();
    }
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

// NOTE: sessionStorage is used here for demo simplicity. For production, prefer
// httpOnly, Secure, SameSite cookies issued by the API so the JWT is never
// reachable from JavaScript (mitigates XSS token theft).
// export const tokenStore = {
//   get(key: "lecturerToken" | "studentToken"): string | null {
//     if (typeof window === "undefined") return null;
//     return window.sessionStorage.getItem(key);
//   },
//   set(key: "lecturerToken" | "studentToken", value: string) {
//     window.sessionStorage.setItem(key, value);
//   },
//   clear(key: "lecturerToken" | "studentToken") {
//     window.sessionStorage.removeItem(key);
//   },
// };

export const api = {
  lecturerLogin: (email: string, password: string) =>
    request<{ ok: boolean }>("/api/auth/lecturer/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuthRedirect: true,
    }),

  lecturerRegister: (name: string, email: string, password: string) =>
    request<{ ok: boolean }>("/api/auth/lecturer/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
      skipAuthRedirect: true,
    }),

  createTest: (payload: Record<string, unknown>) =>
    request<{ test: { id: string; linkToken: string; title: string; status: string }; accessCode: string | null }>(
      "/api/tests",
      { method: "POST", body: JSON.stringify(payload) }
    ),

  uploadRoster: async (testId: string, file: File) => {
    const form = new FormData();
    form.append("roster", file);
    
    const res = await fetch(`${API_BASE}/api/tests/${testId}/roster`, {
      method: "POST",
      credentials: "include",
      body: form,
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body as {
      acceptedCount: number;
      rejectedCount: number;
      rejectedReasons: string[];
      namesAdded: number;
      ignoredNameCount: number;
    };
  },

  uploadQuestions: async (testId: string, file: File, defaultTopic: string) => {
    const form = new FormData();
    form.append("defaultTopic", defaultTopic);
    form.append("questions", file);

    const res = await fetch(`${API_BASE}/api/tests/${testId}/questions/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Upload failed");
    return body as { acceptedCount: number; rejectedCount: number; rejectedReasons: string[] };
  },

  getMe: () =>
  request<{ id: string; name: string; email: string; createdAt: string }>("/api/auth/lecturer/me"),

  logout: () =>
  request<{ message: string }>("/api/auth/logout", {
    method: "POST",
  }),

  listMyTests: (page = 1, pageSize = 10) =>
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
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      summary: { total: number; published: number; drafts: number; students: number };
    }>(`/api/tests?page=${page}&pageSize=${pageSize}`),

  regenerateAccessCode: (testId: string) =>
    request<{ accessCode: string }>(`/api/tests/${testId}/access-code/regenerate`, { method: "POST" }),

  generateQuestions: (testId: string, count?: number) =>
    request<{ count: number; requested: number; remainingGenerations: number; note: string }>(
      `/api/tests/${testId}/generate-questions`,
      { method: "POST", body: JSON.stringify(count ? { count } : {}) }
    ),

  updateSettings: (
    testId: string,
    payload: { questionsPerStudent?: number | null; marksPerQuestion?: 1 | 2 }
  ) =>
    request<{ questionsPerStudent: number | null; marksPerQuestion: 1 | 2 }>(
      `/api/tests/${testId}/settings`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),

  listQuestions: (
    testId: string,
    query: { page?: number; pageSize?: number; status?: string; topic?: string; q?: string } = {}
  ) =>
    request<{
      questions: {
        id: string;
        text: string;
        options: string[];
        correctOptionIndex: number;
        topic: string;
        approved: boolean;
      }[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      summary: {
        total: number;
        approved: number;
        pending: number;
        topics: { topic: string; count: number }[];
      };
    }>(
      `/api/tests/${testId}/questions?${new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)])
      )}`
    ),

  deleteQuestion: (testId: string, questionId: string) =>
    request<{ ok: boolean }>(`/api/tests/${testId}/questions/${questionId}`, { method: "DELETE" }),

  bulkQuestions: (
    testId: string,
    body: { action: "approve" | "delete"; ids?: string[]; all?: "pending" }
  ) =>
    request<{ affected: number }>(`/api/tests/${testId}/questions/bulk`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateQuestion: (
    testId: string,
    questionId: string,
    payload: {
      text: string;
      options: string[];
      correctOptionIndex: number;
      topic: string;
    }
  ) =>
    request<{
      ok: boolean;
      question: {
        id: string;
        text: string;
        options: string[];
        correctOptionIndex: number;
        topic: string;
        approved: boolean;
      };
    }>(
      `/api/tests/${testId}/questions/${questionId}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    ),

  deleteTest: (testId: string) =>
  request<{
    ok: boolean;
    message: string;
  }>(
    `/api/tests/${testId}`,
    {
      method: "DELETE",
    }
  ),
    
  addManualQuestion: (
    testId: string,
    payload: { text: string; options: string[]; correctOptionIndex: number; topic: string }
  ) =>
    request<{ id: string }>(
      `/api/tests/${testId}/questions/manual`,
      { method: "POST", body: JSON.stringify(payload) }
    ),

  approveQuestions: (testId: string, approvedQuestionIds: string[]) =>
    request<{ ok: boolean }>(
      `/api/tests/${testId}/questions`,
      { method: "PATCH", body: JSON.stringify({ approvedQuestionIds }) }
    ),

  generateLink: (testId: string) =>
    request<{ linkToken: string; status: string }>(`/api/tests/${testId}/link`, { method: "POST" }),

  liveResults: (
    testId: string,
    query: { page: number; pageSize: number; q: string; status: string }
  ) =>
    request<{
      results: {
        idNumber: string;
        name: string;
        status: "submitted" | "auto-submitted";
        score: number | null;
        total: number | null;
        submittedAt: string | null;
      }[];
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      summary: {
        submitted: number;
        autoSubmitted: number;
        averageScore: number | null;
        totalPossible: number | null;
      };
    }>(
      `/api/tests/${testId}/results?${new URLSearchParams({
        page: String(query.page),
        pageSize: String(query.pageSize),
        q: query.q,
        status: query.status,
      })}`
    ),

  exportResults: async (testId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/tests/${testId}/export`, {
      credentials: "include",
    });

    if (res.status === 401) return redirectToLogin();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? "Failed to export results", res.status);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    link.download = match?.[1] ?? `test-results-${testId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  studentLogin: (linkToken: string, idNumber: string, accessCode?: string) =>
    request<{ testId: string; durationMinutes: number }>(
      "/api/auth/student/login",
      {
        method: "POST",
        body: JSON.stringify({ linkToken, idNumber, accessCode }),
      }
    ),

  startAttempt: (linkToken: string) =>
    request<{ attemptId: string; deadline: string; status: string }>(
      `/api/attempts/${linkToken}/start`,
      { method: "POST" }
    ),

  getAttemptInfo: (linkToken: string) =>
  request<
    | { state: "in-progress"; deadline: string }
    | { state: "finished" }
    | {
        state: "not-started";
        marksPerQuestion: number; 
        totalMarks: number;
        title: string;
        instructions: string;
        durationMinutes: number;
        minutesAvailable: number;
        questionCount: number;
      }
  >(`/api/attempts/${linkToken}/info`),

  getQuestions: (linkToken: string) =>
    request<{
      deadline: string;
      questions: { id: string; text: string; options: string[] }[];
      answers?: Record<string, number>; 
      marksPerQuestion?: number;
    }>(`/api/attempts/${linkToken}/questions`),

  saveAnswer: (
    linkToken: string,
    questionId: string,
    selectedOptionIndex: number
  ) =>
    request<{ ok: boolean }>(
      `/api/attempts/${linkToken}/answer`,
      {
        method: "POST",
        body: JSON.stringify({ questionId, selectedOptionIndex }),
      }
    ),

  heartbeat: (
    linkToken: string,
    visibility?: "hidden" | "focus" | "visible"
  ) =>
    request<{
      status: string;
      reason?: string;
      deadline?: string;
      focusLossCount?: number;
      violationLimit?: number;
      warning?: boolean;
    }>(`/api/attempts/${linkToken}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(
        visibility ? { visibility } : {}
      ),
    }),

  submit: (linkToken: string) =>
    request<{ status: string; score: number | null; total: number }>(
      `/api/attempts/${linkToken}/submit`,
      { method: "POST" }
    ),

  getResult: (linkToken: string) =>
    request<{ status: string; score: number | null; total: number | null }>(
      `/api/attempts/${linkToken}/result`
    ),
};
