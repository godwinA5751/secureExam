import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../../lib/api";

type Question = { id: string; text: string; options: string[] };
type EndReason = "submitted" | "time-up" | "violation" | "already-submitted" | "ended" | "error";
type Info = {
  title: string;
  instructions: string;
  durationMinutes: number;
  minutesAvailable: number;
  questionCount: number;
  totalMarks: number;
  marksPerQuestion: number;
};

const statusOf = (e: any): number | null => (typeof e?.status === "number" ? e.status : null);
// 401/403/404 from the attempt endpoints mean the attempt is over (or the session expired).
const isAttemptOver = (e: any) => [401, 403, 404].includes(statusOf(e) ?? -1);

const ENDED_COPY: Record<EndReason, { title: string; body?: string }> = {
  submitted: { title: "Attempt submitted", body: "Your answers have been recorded." },
  "time-up": { title: "Time is up", body: "Your answers were submitted automatically." },
  violation: {
    title: "Test ended",
    body: "Your attempt was submitted automatically because this window lost focus.",
  },
  "already-submitted": {
    title: "Attempt closed",
    body: "You have already completed this test, or its time has ended.",
  },
  ended: {
    title: "Attempt ended",
    body: "This attempt is no longer open. Your saved answers have been submitted.",
  },
  error: { title: "Unable to open the test" },
};

export default function StudentTest() {
  const router = useRouter();
  const { linkToken } = router.query as { linkToken?: string };
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [deadline, setDeadline] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "briefing" | "in-progress" | "ended">("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [starting, setStarting] = useState(false);
  const [endReason, setEndReason] = useState<EndReason>("ended");
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [finalTotal, setFinalTotal] = useState<number | null>(null);
  const [scoreGaveUp, setScoreGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submittedRef = useRef(false);
  const zeroFiredRef = useRef(false);
  const [current, setCurrent] = useState(0); // index of the question on screen
  const [marksPer, setMarksPer] = useState(1);

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

  function endAttempt(reason: EndReason) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setEndReason(reason);
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
        endAttempt("ended");
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

  // Starts (or resumes) the attempt and loads the questions plus any saved answers.
  async function openAttempt() {
    if (!linkToken) return;
    const start = await api.startAttempt(linkToken);
    if (start.status !== "in-progress") {
      setEndReason("already-submitted");
      setStatus("ended");
      return;
    }
    setDeadline(start.deadline);
    const q = await api.getQuestions(linkToken);
    setQuestions(q.questions);
    setMarksPer(q.marksPerQuestion ?? 1);
    const saved = q.answers ?? {};
    setAnswers(saved);
    const firstOpen = q.questions.findIndex((x) => saved[x.id] === undefined);
    setCurrent(firstOpen === -1 ? 0 : firstOpen);
    setStatus("in-progress");
  }

  // Bootstrap: look at the attempt state first, WITHOUT starting the clock.
  useEffect(() => {
    if (!linkToken) return;
    (async () => {
      try {
        const i = await api.getAttemptInfo(linkToken);
        if (i.state === "finished") {
          setEndReason("already-submitted");
          setStatus("ended");
          return;
        }
        if (i.state === "in-progress") {
          await openAttempt(); // resuming after a refresh: skip the briefing
          return;
        }
        setInfo(i);
        setStatus("briefing");
      } catch (err: any) {
        setError(err.message);
        setEndReason("error");
        setStatus("ended");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkToken]);

  async function handleBegin() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      await openAttempt();
    } catch (err: any) {
      setError(err.message);
      setEndReason("error");
      setStatus("ended");
    } finally {
      setStarting(false);
    }
  }

  // Countdown display: shows immediately, then updates every second.
  useEffect(() => {
    if (!deadline || status !== "in-progress" || !linkToken) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0 && !zeroFiredRef.current) {
        // Time is up: ask the server right away instead of waiting for the next heartbeat.
        zeroFiredRef.current = true;
        api
          .heartbeat(linkToken)
          .then((hb) => {
            if (hb.status !== "in-progress") endAttempt("time-up");
          })
          .catch((err) => {
            if (isAttemptOver(err)) endAttempt("time-up");
          });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, status, linkToken]);

  // Heartbeat (also deadline enforcement) + retry of unsaved answers.
  useEffect(() => {
    if (!deadline || status !== "in-progress" || !linkToken) return;
    const interval = setInterval(async () => {
      if (Object.keys(pendingRef.current).length > 0) {
        flushPending().finally(syncUnsaved);
      }

      try {
        const hb = await api.heartbeat(linkToken);
        if (hb.status !== "in-progress") {
          endAttempt(hb.reason === "deadline" ? "time-up" : "ended");
        }
      } catch (err: any) {
        // The server already ended this attempt (sweep, deadline, blur): stop showing the exam.
        if (isAttemptOver(err)) endAttempt("ended");
        // Otherwise a network hiccup - the backend sweep is the safety net if this keeps failing.
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, status, linkToken]);

  // Tab-visibility anti-cheat: only active while the exam itself is on screen
  // (not on the briefing screen), so reading the instructions can't end the test.
  useEffect(() => {
    if (status !== "in-progress" || !linkToken) return;

    async function reportAndEnd(type: "blur" | "hidden") {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setEndReason("violation");
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

  function goTo(index: number) {
    setCurrent(Math.min(Math.max(index, 0), questions.length - 1));
    window.scrollTo({ top: 0 });
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
      setFinalTotal(result.total ?? questions.length);
      setEndReason(result.status === "auto-submitted" ? "time-up" : "submitted");
      setStatus("ended");
    } catch (err: any) {
      if (isAttemptOver(err)) {
        // Already finalized on the server (deadline, sweep or tab violation).
        endAttempt("ended");
      } else {
        setSubmitError("Could not submit. Check your connection and press Submit again.");
      }
    } finally {
      setLoading(false);
    }
  }

  // After the attempt ends for any reason (time up, focus loss, reopened link), fetch the score.
  useEffect(() => {
    if (status !== "ended" || !linkToken || finalScore !== null || endReason === "error") return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          const r = await api.getResult(linkToken);
          if (r.score !== null && r.total !== null) {
            setFinalScore(r.score);
            setFinalTotal(r.total);
            return;
          }
        } catch (err: any) {
          if (statusOf(err) === 401 || statusOf(err) === 404) break; // session gone: stop quietly
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!cancelled) setScoreGaveUp(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, endReason, linkToken, finalScore]);

  if (status === "loading") return <Centered>Loading test…</Centered>;

  if (status === "briefing" && info) {
    const shortened = info.minutesAvailable < info.durationMinutes;
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">{info.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {info.questionCount} question{info.questionCount === 1 ? "" : "s"} · {info.totalMarks} mark
            {info.totalMarks === 1 ? "" : "s"} · {info.minutesAvailable} minute
            {info.minutesAvailable === 1 ? "" : "s"}
            {shortened && " (shortened because the test closes soon)"}
          </p>

          {info.instructions.trim() && (
            <div className="mt-5">
              <h2 className="text-sm font-semibold text-slate-800">Instructions</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{info.instructions}</p>
            </div>
          )}

          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-1 font-medium">Before you begin</p>
            <ul className="list-inside list-disc space-y-1">
              <li>The timer starts when you press Begin and cannot be paused.</li>
              <li>
                Switching tabs or windows, or opening another app, ends your test and submits your
                answers immediately.
              </li>
              <li>Close other windows and silence notifications first.</li>
              <li>Answers save as you select them. You cannot change them after you submit.</li>
            </ul>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <button
            onClick={handleBegin}
            disabled={starting}
            className="mt-6 w-full cursor-pointer rounded-lg bg-slate-900 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? "Starting…" : "Begin test"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    const copy = ENDED_COPY[endReason];
    return (
      <Centered>
        <p className="text-lg font-medium text-slate-800 mb-2">{copy.title}</p>
        {copy.body && <p className="text-sm text-slate-600">{copy.body}</p>}
        {finalScore !== null && finalTotal !== null ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Your score</p>
            <p className="text-xl md:text-lg lg:text-md font-bold text-slate-900">
              {finalScore}/{finalTotal}
            </p>
          </div>
        ) : endReason === "error" ? null : scoreGaveUp ? (
          <p className="mt-2 text-sm text-slate-500">Your score will be available from your lecturer.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Getting your score…</p>
        )}
        {endReason === "error" && error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <p className="text-xs text-slate-400 mt-4">You may close this tab.</p>
      </Centered>
    );
  }

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const unanswered = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto fixed top-0 left-0 right-0 bg-slate-50 border-b border-slate-200 p-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">SecureExam</h1>
          {remaining !== null && (
            <span
              className={`text-sm font-mono ${remaining <= 60 ? "text-red-600 font-semibold" : "text-slate-600"}`}
            >
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
      <div className="max-w-2xl mx-auto pt-20 pb-10">
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {questions[current] && (
          <section
            key={questions[current].id}
            className="bg-white rounded-xl border border-slate-200 p-6"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Question {current + 1} of {questions.length} · {marksPer} mark{marksPer === 1 ? "" : "s"}
            </p>
            <fieldset className="mt-2">
              <legend className="text-base font-medium text-slate-800">{questions[current].text}</legend>
              <div className="mt-4 space-y-2">
                {questions[current].options.map((opt, idx) => {
                  const q = questions[current];
                  const selected = answers[q.id] === idx;
                  return (
                    <label
                      key={idx}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                        selected
                          ? "border-violet-500 bg-violet-50 text-slate-900"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        checked={selected}
                        onChange={() => handleAnswer(q.id, idx)}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
            disabled={current >= questions.length - 1}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">Questions</p>
            <p className="text-xs text-slate-400">
              {answeredCount} of {questions.length} answered
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {questions.map((q, i) => {
              const isCurrent = i === current;
              const isAnswered = answers[q.id] !== undefined;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Question ${i + 1}, ${isAnswered ? "answered" : "not answered"}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`h-9 w-9 rounded-lg border text-xs font-medium cursor-pointer ${
                    isCurrent
                      ? "border-violet-600 bg-violet-600 text-white"
                      : isAnswered
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Purple is the question you are on, green is answered, white is not answered yet.
          </p>
        </div>

        {submitError && <p className="mt-6 text-sm text-red-600">{submitError}</p>}
        <button
          onClick={() => setConfirming(true)}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-slate-900 text-white py-3 text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Submitting..." : "Submit test"}
        </button>
      </div>

      {/* In-page dialog on purpose: a native confirm() would blur the window and auto-submit. */}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-800">
              Submit your test?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              You have answered {answeredCount} of {questions.length} questions.
              {unanswered > 0 && (
                <span className="font-medium text-amber-700"> {unanswered} unanswered.</span>
              )}{" "}
              You cannot change your answers after submitting.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 cursor-pointer"
              >
                Go back
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  handleSubmit();
                }}
                className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white cursor-pointer"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-4">{children}</div>;
}