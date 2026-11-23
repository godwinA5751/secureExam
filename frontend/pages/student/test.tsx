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
    title: "Test submitted automatically",
    body: "Your attempt was submitted after the exam tab was hidden twice.",
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
  const [focusLossCount, setFocusLossCount] = useState(0);
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

        if (typeof hb.focusLossCount === "number") {
          setFocusLossCount(hb.focusLossCount);
        }

        if (hb.status !== "in-progress") {
          endAttempt(
            hb.reason === "deadline"
              ? "time-up"
              : hb.reason === "focus-loss"
                ? "violation"
                : "ended"
          );
        }
      }catch (err: any) {
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

    let reportChain = Promise.resolve();

    const reportVisibility = (
      type: "hidden" | "focus" | "visible"
    ) => {
      // Keep events ordered so a quick return cannot overtake "hidden".
      reportChain = reportChain
        .then(async () => {
          if (submittedRef.current) return;

          try {
            const hb = await api.heartbeat(linkToken, type);

            if (typeof hb.focusLossCount === "number") {
              setFocusLossCount(hb.focusLossCount);
            }

            if (hb.status !== "in-progress") {
              endAttempt(
                hb.reason === "focus-loss"
                  ? "violation"
                  : hb.reason === "deadline"
                    ? "time-up"
                    : "ended"
              );
            }
          } catch (err: any) {
            if (isAttemptOver(err)) {
              endAttempt("ended");
            }
            // Temporary network errors do not themselves end the exam.
          }
        })
        .catch(() => {
          // Keep the event chain usable if an earlier event fails.
        });
    };

    const onVisibility = () => {
      reportVisibility(
        document.visibilityState === "hidden"
          ? "hidden"
          : "visible"
      );
    };

    const onFocus = () => {
      reportVisibility("focus");
    };

    // Initialize visibility state without treating initial visibility
    // as a violation when the page is already visible.
    reportVisibility(
      document.visibilityState === "hidden"
        ? "hidden"
        : "visible"
    );

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
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

  
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          <p className="mt-5 text-sm font-semibold text-slate-700">
            Preparing your examination
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Please wait while we verify your access.
          </p>
        </div>
      </div>
    );
  }

  if (status === "briefing" && info) {
    const shortened = info.minutesAvailable < info.durationMinutes;

    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
        <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-indigo-100/60 blur-3xl" />

        <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="bg-gradient-to-r from-[#111b35] to-[#233d70] px-6 py-8 text-white sm:px-9">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-6 w-6"
                >
                  <path
                    d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"
                    strokeLinejoin="round"
                  />
                  <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold">SecureExam</p>
                <p className="text-xs text-blue-100">Student examination portal</p>
              </div>
            </div>

            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-blue-100">
              Examination briefing
            </span>

            <h1 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">
              {info.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-blue-100">
              Review the examination details and instructions before you begin.
            </p>
          </div>

          <div className="p-6 sm:p-9">
            <div className="grid grid-cols-3 gap-3">
              <BriefingStat
                label="Questions"
                value={info.questionCount}
                icon="questions"
              />
              <BriefingStat
                label="Total marks"
                value={info.totalMarks}
                icon="marks"
              />
              <BriefingStat
                label="Duration"
                value={`${info.minutesAvailable} min`}
                icon="time"
              />
            </div>

            {shortened && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Your available time has been shortened because the examination
                closing time is approaching.
              </div>
            )}

            {info.instructions.trim() && (
              <section className="mt-7">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <path
                        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Examination instructions
                  </h2>
                </div>

                <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                  {info.instructions}
                </div>
              </section>
            )}

            <section className="mt-7">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path
                      d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"
                      strokeLinejoin="round"
                    />
                    <path d="M12 8v4m0 3h.01" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-slate-900">
                  Important examination rules
                </h2>
              </div>

              <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                {[
                  "The examination timer starts when you press Begin and cannot be paused.",
                  "Leaving the examination tab or switching to another application is monitored.",
                  "Repeated focus-loss incidents may automatically submit your examination.",
                  "Your answers are saved automatically as you select them.",
                  "You cannot change your answers after submitting.",
                ].map((rule, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
                      {index + 1}
                    </span>
                    <p className="text-xs leading-5 text-amber-900">{rule}</p>
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleBegin}
              disabled={starting}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? "Preparing examination..." : "Begin examination"}
              {!starting && <span>→</span>}
            </button>

            <p className="mt-4 text-center text-xs text-slate-400">
              Make sure you are ready before starting. Your timer cannot be paused.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (status === "ended") {
    const copy = ENDED_COPY[endReason];

    const successful = endReason !== "error";

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-center shadow-xl shadow-slate-200/50">
          <div className={`px-6 py-9 ${successful ? "bg-gradient-to-br from-[#111b35] to-[#233d70]" : "bg-red-50"}`}>
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
                successful ? "bg-white/10 text-white" : "bg-red-100 text-red-600"
              }`}
            >
              {successful ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-8 w-8"
                >
                  <path
                    d="m5 12 4 4L19 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-8 w-8"
                >
                  <path
                    d="M12 8v5m0 3h.01M10.3 3.8 2.9 17a2 2 0 0 0 1.8 3h14.6a2 2 0 0 0 1.8-3l-7.4-13.2a2 2 0 0 0-3.4 0Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            <h1 className={`mt-5 text-2xl font-bold ${successful ? "text-white" : "text-red-800"}`}>
              {copy.title}
            </h1>
            {copy.body && (
              <p className={`mt-2 text-sm leading-6 ${successful ? "text-blue-100" : "text-red-700"}`}>
                {copy.body}
              </p>
            )}
          </div>

          <div className="p-7">
            {finalScore !== null && finalTotal !== null ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Your final score
                </p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                  {finalScore}
                  <span className="text-xl text-slate-400"> / {finalTotal}</span>
                </p>
              </div>
            ) : endReason === "error" ? (
              error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )
            ) : scoreGaveUp ? (
              <p className="text-sm leading-6 text-slate-500">
                Your score could not be retrieved right now. Please contact your
                lecturer for your result.
              </p>
            ) : (
              <div className="py-3">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                <p className="mt-3 text-sm text-slate-500">
                  Retrieving your examination score...
                </p>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-xs leading-5 text-slate-400">
                Your examination session has ended. You may now safely close this tab.
              </p>
              <p className="mt-4 text-xs font-semibold text-slate-500">
                SecureExam · Student examination portal
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const unanswered = questions.length - answeredCount;
  const progress = questions.length
    ? (answeredCount / questions.length) * 100
    : 0;

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const timerCritical = remaining !== null && remaining <= 60;
  const timerWarning = remaining !== null && remaining <= 300;

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      {/* Fixed examination header */}
      <header className="fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-5 w-5"
              >
                <path
                  d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"
                  strokeLinejoin="round"
                />
                <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                SecureExam
              </p>
              <p className="text-[11px] text-slate-500">
                Examination in progress
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-500">
                Active session
              </span>
            </div>

            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                timerCritical
                  ? "border-red-200 bg-red-50 text-red-700"
                  : timerWarning
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-slate-200 bg-slate-50 text-slate-800"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2 1M9 2h6M12 2v3" strokeLinecap="round" />
              </svg>
              <div>
                <p className="hidden text-[10px] font-medium sm:block">
                  Time remaining
                </p>
                <p className="font-mono text-base font-bold tabular-nums">
                  {remaining !== null ? formatTime(remaining) : "--:--"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Answer save status */}
        {unsavedCount > 0 && (
          <div className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
            Saving {unsavedCount} pending answer{unsavedCount === 1 ? "" : "s"}...
            Please keep your connection active.
          </div>
        )}
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-28 sm:px-6 sm:pt-24">
        {/* Exam alerts */}
        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {focusLossCount === 1 && status === "in-progress" && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              !
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Examination focus warning
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                This is your first recorded incident. Leaving the examination
                tab and triggering another incident may automatically submit
                your attempt.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main question area */}
          <section className="min-w-0">
            {/* Progress summary */}
            {/* <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Your examination
                  </p>
                  <h1 className="mt-1 text-lg font-bold text-slate-900">
                    Question {current + 1} of {questions.length}
                  </h1>
                </div>
                <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                  {marksPer} mark{marksPer === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{answeredCount} answered</span>
                <span>{Math.round(progress)}% completed</span>
              </div>
            </div> */}

            {/* Question */}
            {questions[current] && (
              <section
                key={questions[current].id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
              >
                <div className="mb-6 flex items-center justify-between gap-3">
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    Question {current + 1}
                  </span>
                  <span className="text-xs text-slate-400">
                    Select one answer
                  </span>
                </div>

                <fieldset>
                  <legend className="w-full text-base font-semibold leading-8 text-slate-900 sm:text-lg">
                    {questions[current].text}
                  </legend>

                  <div className="mt-7 space-y-3">
                    {questions[current].options.map((option, index) => {
                      const question = questions[current];
                      const selected = answers[question.id] === index;

                      return (
                        <label
                          key={index}
                          className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                            selected
                              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                              : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            checked={selected}
                            onChange={() => handleAnswer(question.id, index)}
                            className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                          />

                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              selected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-700"
                            }`}
                          >
                            {String.fromCharCode(65 + index)}
                          </span>

                          <span className={`min-w-0 pt-1 text-sm leading-6 ${
                            selected ? "font-semibold text-blue-950" : "text-slate-700"
                          }`}>
                            {option}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>
            )}

            {/* Question navigation */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span>←</span>
                Previous
              </button>

              {current < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goTo(current + 1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Next question
                  <span>→</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Review and submit
                  <span>→</span>
                </button>
              )}
            </div>
          </section>

          {/* Question navigator sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Question navigator
                </h2>
                <span className="text-xs font-medium text-slate-400">
                  {questions.length} total
                </span>
              </div>

              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-7 lg:grid-cols-5">
                {questions.map((question, index) => {
                  const isCurrent = index === current;
                  const isAnswered = answers[question.id] !== undefined;

                  return (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => goTo(index)}
                      aria-label={`Question ${index + 1}, ${
                        isAnswered ? "answered" : "not answered"
                      }`}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`flex aspect-square items-center justify-center rounded-xl border text-xs font-bold transition ${
                        isCurrent
                          ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-100"
                          : isAnswered
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                      }`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                <Legend color="bg-blue-600" label="Current question" />
                <Legend color="bg-emerald-500" label="Answered" />
                <Legend color="bg-slate-200" label="Not answered" />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">
                Your progress
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-2xl font-bold text-emerald-700">
                    {answeredCount}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">Answered</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-2xl font-bold text-amber-700">
                    {unanswered}
                  </p>
                  <p className="mt-1 text-xs text-amber-700">Remaining</p>
                </div>
              </div>

              {unsavedCount > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  {unsavedCount} answer{unsavedCount === 1 ? "" : "s"} still
                  waiting to save. Submission will check that all answers are
                  saved first.
                </p>
              )}

              {submitError && (
                <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">
                  {submitError}
                </p>
              )}

              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#111b35] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1d2c4d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit examination"}
              </button>

              <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">
                Review your answers before submitting. You cannot make changes
                afterward.
              </p>
            </section>
          </aside>
        </div>
      </div>

      {/* Submission confirmation dialog */}
      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-6 w-6"
                  >
                    <path
                      d="M5 12h14M13 6l6 6-6 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <h2 id="confirm-title" className="text-base font-bold text-slate-900">
                    Submit your examination?
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Please confirm your final submission.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm leading-6 text-slate-600">
                You have answered{" "}
                <strong className="text-slate-900">{answeredCount}</strong> of{" "}
                <strong className="text-slate-900">{questions.length}</strong>{" "}
                questions.
              </p>

              {unanswered > 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                    !
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {unanswered} unanswered question{unanswered === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      You still have unanswered questions. You can go back and
                      complete them before submitting.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  All questions have been answered.
                </div>
              )}

              <p className="mt-4 text-xs leading-5 text-slate-500">
                Once submitted, your answers cannot be changed.
              </p>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Continue examination
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    handleSubmit();
                  }}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Confirm submission"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function BriefingStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: "questions" | "marks" | "time";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
        {icon === "questions" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
          </svg>
        )}
        {icon === "marks" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12h8M12 8v8" strokeLinecap="round" />
          </svg>
        )}
        {icon === "time" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2 1M9 2h6" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="mt-3 text-lg font-bold text-slate-900 sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      {children}
    </div>
  );
}
