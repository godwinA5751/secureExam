import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { api, tokenStore } from "../../lib/api";

type Question = { id: string; text: string; options: string[] };

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
  const submittedRef = useRef(false);

  const token = typeof window !== "undefined" ? tokenStore.get("studentToken") : null;

  // Bootstrap: start (or resume) the attempt, then load questions.
  useEffect(() => {
    if (!linkToken || !token) return;
    (async () => {
      try {
        const start = await api.startAttempt(token, linkToken);
        if (start.status !== "in-progress") {
          setStatus("ended");
          return;
        }
        setDeadline(start.deadline);
        const q = await api.getQuestions(token, linkToken);
        setQuestions(q.questions);
        setStatus("in-progress");
      } catch (err: any) {
        setError(err.message);
        setStatus("ended");
      }
    })();
  }, [linkToken, token]);

  // Countdown + periodic heartbeat (also acts as the deadline enforcement ping).
  useEffect(() => {
    if (!deadline || status !== "in-progress" || !token || !linkToken) return;
    const interval = setInterval(async () => {
      const secs = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      try {
        const hb = await api.heartbeat(token, linkToken);
        if (hb.status !== "in-progress" && !submittedRef.current) {
          submittedRef.current = true;
          setStatus("ended");
        }
      } catch {
        // Network hiccup - the backend sweep is the safety net if this keeps failing.
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [deadline, status, token, linkToken]);

  // Tab-visibility anti-cheat: any loss of focus/visibility ends the attempt immediately.
  useEffect(() => {
    if (status !== "in-progress" || !token || !linkToken) return;

    async function reportAndEnd(type: "blur" | "hidden") {
      if (submittedRef.current) return;
      submittedRef.current = true;
      try {
        await api.heartbeat(token!, linkToken!, type);
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
  }, [status, token, linkToken]);

  async function handleAnswer(questionId: string, index: number) {
    if (!token || !linkToken) return;
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
    try {
      await api.saveAnswer(token, linkToken, questionId, index);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSubmit() {
    if (!token || !linkToken || submittedRef.current) return;
    submittedRef.current = true;
    try {
      const result = await api.submit(token, linkToken);
      setFinalScore(result.score);
    } finally {
      setStatus("ended");
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
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-base font-semibold text-slate-800">SecureExam</h1>
          {remaining !== null && (
            <span className="text-sm font-mono text-slate-600">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </span>
          )}
        </div>

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

        <button
          onClick={handleSubmit}
          className="mt-8 w-full rounded-lg bg-slate-900 text-white py-3 text-sm font-medium"
        >
          Submit test
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-4">{children}</div>;
}
