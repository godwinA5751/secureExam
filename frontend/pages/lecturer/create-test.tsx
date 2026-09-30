import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api, tokenStore } from "../../lib/api";

type QuestionRow = {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  topic: string;
  approved: boolean;
};

export default function CreateTest() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState(20);
  const [testId, setTestId] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [rosterMsg, setRosterMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qTopic, setQTopic] = useState("");

  const token = () => tokenStore.get("lecturerToken");

  async function refreshQuestions(id: string) {
    const t = token();
    if (!t) return;
    const { questions } = await api.listQuestions(t, id);
    setQuestions(questions);
  }

  useEffect(() => {
    if (testId) refreshQuestions(testId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const t = token();
    if (!t) return router.push("/lecturer/login");

    try {
      const { test, accessCode } = await api.createTest(t, {
        title,
        topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
        loginWindowStart: new Date(start).toISOString(),
        loginWindowEnd: new Date(end).toISOString(),
        durationMinutes: duration,
        questionGenMode: "manual",
        requiresAccessCode: true,
      });
      setTestId(test.id);
      setLinkToken(test.linkToken);
      setAccessCode(accessCode);
      setQTopic(topics.split(",")[0]?.trim() ?? "");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRoster(e: React.ChangeEvent<HTMLInputElement>) {
    const t = token();
    const file = e.target.files?.[0];
    if (!t || !testId || !file) return;
    try {
      const result = await api.uploadRoster(t, testId, file);
      setRosterMsg(`${result.acceptedCount} student(s) added, ${result.rejectedCount} row(s) rejected.`);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleGenerateAI() {
    const t = token();
    if (!t || !testId) return;
    setError(null);
    setAiLoading(true);
    try {
      await api.generateQuestions(t, testId);
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    const t = token();
    if (!t || !testId) return;
    setError(null);
    try {
      await api.addManualQuestion(t, testId, {
        text: qText,
        options: qOptions.filter((o) => o.trim().length > 0),
        correctOptionIndex: qCorrect,
        topic: qTopic,
      });
      setQText("");
      setQOptions(["", "", "", ""]);
      setQCorrect(0);
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleApproveAll() {
    const t = token();
    if (!t || !testId) return;
    const unapprovedIds = questions.filter((q) => !q.approved).map((q) => q.id);
    if (unapprovedIds.length === 0) return;
    try {
      await api.approveQuestions(t, testId, unapprovedIds);
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handlePublish() {
    const t = token();
    if (!t || !testId) return;
    setError(null);
    try {
      await api.generateLink(t, testId);
      setPublished(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const approvedCount = questions.filter((q) => q.approved).length;
  const unapprovedCount = questions.length - approvedCount;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-lg font-semibold text-slate-800 mb-6">Create test</h1>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!testId && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Topics (comma-separated)</label>
              <input value={topics} onChange={(e) => setTopics(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Login window start</label>
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Login window end</label>
                <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Duration per student (minutes)</label>
              <input type="number" min={1} max={480} value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium">
              Create test
            </button>
          </form>
        )}

        {testId && !published && (
          <div className="space-y-6">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <p className="font-medium mb-1">Access code (share once, out-of-band)</p>
              <p className="font-mono text-lg tracking-widest">{accessCode}</p>
              <p className="mt-1 text-xs">Won&apos;t be shown again. Distribute alongside the roster, not with the link.</p>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">Upload roster (CSV, one ID per row)</label>
              <input type="file" accept=".csv" onChange={handleRoster} className="w-full text-sm" />
              {rosterMsg && <p className="text-xs text-slate-500 mt-1">{rosterMsg}</p>}
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Questions</h2>

              <button
                onClick={handleGenerateAI}
                disabled={aiLoading}
                className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 mb-4"
              >
                {aiLoading ? "Generating..." : "Generate questions with AI"}
              </button>

              <form onSubmit={handleAddManual} className="space-y-2 mb-4 bg-slate-50 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-600 mb-1">Add a question manually</p>
                <input value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Question text" required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                {qOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={qCorrect === i}
                      onChange={() => setQCorrect(i)}
                      title="Mark as correct answer"
                    />
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...qOptions];
                        next[i] = e.target.value;
                        setQOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      required={i < 2}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <input value={qTopic} onChange={(e) => setQTopic(e.target.value)} placeholder="Topic" required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button type="submit" className="w-full rounded-lg bg-slate-800 text-white py-2 text-sm font-medium">
                  Add question
                </button>
              </form>

              {questions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      {approvedCount} approved, {unapprovedCount} pending review
                    </p>
                    {unapprovedCount > 0 && (
                      <button onClick={handleApproveAll} className="text-xs font-medium text-emerald-700 underline">
                        Approve all pending
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {questions.map((q) => (
                      <li key={q.id} className="p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-slate-800">{q.text}</p>
                          <span
                            className={`text-xs shrink-0 rounded-full px-2 py-0.5 ${
                              q.approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {q.approved ? "approved" : "pending"}
                          </span>
                        </div>
                        <ul className="mt-1 text-xs text-slate-500 list-disc list-inside">
                          {q.options.map((o, i) => (
                            <li key={i} className={i === q.correctOptionIndex ? "text-emerald-700 font-medium" : ""}>
                              {o}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={handlePublish}
              disabled={approvedCount === 0}
              className="w-full rounded-lg bg-emerald-700 text-white py-2 text-sm font-medium disabled:opacity-50"
            >
              Publish test
            </button>
            {approvedCount === 0 && (
              <p className="text-xs text-slate-400 -mt-4">Add or approve at least one question to publish.</p>
            )}
          </div>
        )}

        {testId && published && linkToken && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-emerald-700">Test published.</p>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Student login link (share this)</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={studentLoginUrl(linkToken)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono bg-slate-50"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(studentLoginUrl(linkToken))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Send this link and the access code through separate channels.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function studentLoginUrl(linkToken: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/student/login?linkToken=${linkToken}`;
}