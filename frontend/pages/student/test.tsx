import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../../lib/api";

type Question = { id: string; text: string; options: string[] };

// HTTP status of an ApiError, or null for network failures.
const statusOf = (e: any): number | null => (typeof e?.status === "number" ? e.status : null);
// 401/403/404 from the attempt endpoints mean the attempt is over (or the session expired).
const isAttemptOver = (e: any) => [401, 403, 404].includes(statusOf(e) ?? -1);

export default function StudentTest() {
  const router = useRouter();
  const { linkToken } = router.query as { linkToken?: string };
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [deadline, setDeadline] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "in-progress" | "ended">("loading");
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const submittedRef = useRef(false);

  // Latest chosen option per question that the server has NOT confirmed yet.
  const pendingRef = useRef<Record<string, number>>({});
  // Saves for the SAME question run in click order; different questions save in parallel.
  const chainsRef = useRef<Record<string, Promise<unknown>>>({});
  const inFlightRef = useRef<Record<string, number>>({});

  function syncUnsaved() {
    setUnsavedCount(Object.keys(pendingRef.current).length);
  }

  function enqueue<T>(questionId: string, task: () => Promise<T>): Promise<T> {
    inFlightRef.current[questionId] = (inFlightRef.current[questionId] ?? 0) + 1;
    const prev = chainsRef.current[questionId] ?? Promise.resolve();
    const run = prev.then(task);
    chainsRef.current[questionId] = run.then(
      () => undefined,
      () => undefined
    );
    run
      .finally(() => {
        inFlightRef.current[questionId] -= 1;
      })
      .catch(() => {});
    return run;
  }

  function endAttempt() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("ended");
  }

  // Never throws. On a retriable failure the answer simply stays in pendingRef.
  async function saveOne(questionId: string, index: number) {
    if (!linkToken) return;
    try {
      await api.saveAnswer(linkToken, questionId, index);
      // Only clear it if the student hasn't picked something newer meanwhile.
      if (pendingRef.current[questionId] === index && (inFlightRef.current[questionId] ?? 0) <= 1) {
        delete pendingRef.current[questionId];
      }
    } catch (err: any) {
      if (isAttemptOver(err)) {
        endAttempt();
      } else if (statusOf(err) === 400) {
        delete pendingRef.current[questionId]; // rejected for good, retrying won't help
        setError(err.message);
        setTimeout(() => setError(null), 3000);
      }
      // Network error, 5xx or 429: keep it pending, it is retried automatically.
    }
  }

  function flushPending() {
    const jobs = Object.entries(pendingRef.current)
      .filter(([qid]) => !(inFlightRef.current[qid] > 0))
      .map(([qid, idx]) => enqueue(qid, () => saveOne(qid, idx)));
    return Promise.all(jobs);
  }

  // Bootstrap: start (or resume) the attempt, then load questions.
  useEffect(() => {
    if (!linkToken) return;
    (async () => {
      try {
        const start = await api.startAttempt(linkToken);
        if (start.status !== "in-progress") {
          setStatus("ended");
          return;
        }
        setDeadline(start.deadline);
        const q = await api.getQuestions(linkToken);
        setQuestions(q.questions);
        setStatus("in-progress");
      } catch (err: any) {
        setError(err.message);
        setStatus("ended");
      }
    })();
  }, [linkToken]);

  // Countdown + periodic heartbeat (also deadline enforcement) + retry of unsaved answers.
  useEffect(() => {
    if (!deadline || status !== "in-progress" || !linkToken) return;
    const interval = setInterval(async () => {
      const secs = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(secs);

      if (Object.keys(pendingRef.current).length > 0) {
        flushPending().finally(syncUnsaved);
      }

      try {
        const hb = await api.heartbeat(linkToken);
        if (hb.status !== "in-progress") endAttempt();
      } catch (err: any) {
        // The server already ended this attempt (sweep, deadline, blur): stop showing the exam.
        if (isAttemptOver(err)) endAttempt();
        // Otherwise a network hiccup - the backend sweep is the safety net if this keeps failing.
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, status, linkToken]);

  // Tab-visibility anti-cheat: any loss of focus/visibility ends the attempt immediately.
  useEffect(() => {
    if (status !== "in-progress" || !linkToken) return;

    async function reportAndEnd(type: "blur" | "hidden") {
      if (submittedRef.current) return;
      submittedRef.current = true;
      try {
        await api.heartbeat(linkToken!, type);
      } catch {
        // The server sweep will still finalize the attempt at its deadline.
      } finally {
        setStatus("ended");
      }
    }

    const onBlur = () => reportAndEnd("blur");
    const onVisibility = () => {
      if (document.visibilityState === "hidden") reportAndEnd("hidden");
    };

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, linkToken]);

  function handleAnswer(questionId: string, index: number) {
    if (!linkToken) return;
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
    pendingRef.current[questionId] = index; // "latest intent" until the server confirms it
    syncUnsaved();
    enqueue(questionId, () => saveOne(questionId, index)).finally(syncUnsaved);
  }

  async function handleSubmit() {
    if (!linkToken || loading || submittedRef.current) return;
    setLoading(true);
    setSubmitError(null);
    try {
      await Promise.all(Object.values(chainsRef.current)); // let in-flight saves finish first
      await flushPending();
      syncUnsaved();
      if (Object.keys(pendingRef.current).length > 0) {
        setSubmitError("Some answers haven't saved yet. Check your connection and press Submit again.");
        return;
      }
      const result = await api.submit(linkToken);
      submittedRef.current = true;
      setFinalScore(result.score);
      setStatus("ended");
    } catch (err: any) {
      if (isAttemptOver(err)) {
        // Already finalized on the server (deadline, sweep or tab violation).
        endAttempt();
      } else {
        setSubmitError("Could not submit. Check your connection and press Submit again.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") return <Centered>Loading test…</Centered>;
  if (status === "ended") {
    return (
      <Centered>
        <p className="text-lg font-medium text-slate-800 mb-2">Attempt submitted</p>
        {finalScore !== null && <p className="text-sm text-slate-600">Score: {finalScore}</p>}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-slate-400 mt-4">You may close this tab.</p>
      </Centered>
    );
  }

  return (
    <div className="h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto fixed top-0 left-0 right-0 bg-slate-50 border-b border-slate-200 p-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">SecureExam</h1>
          {remaining !== null && (
            <span className="text-sm font-mono text-slate-600">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        {unsavedCount > 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {unsavedCount} answer{unsavedCount === 1 ? "" : "s"} not saved yet. Retrying automatically…
          </p>
        )}
      </div>
      <div className="overflow-y-auto max-w-2xl mx-auto pt-24 pb-4">
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="space-y-6">
          {questions.map((q, i) => (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm font-medium text-slate-800 mb-3">
                {i + 1}. {q.text}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === idx}
                      onChange={() => handleAnswer(q.id, idx)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {submitError && <p className="mt-6 text-sm text-red-600">{submitError}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-slate-900 text-white py-3 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit test"}
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-4">{children}</div>;
}