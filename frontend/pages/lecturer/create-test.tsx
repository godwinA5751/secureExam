import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../../lib/api";
import { Skeleton } from "../../components/Skeleton";
import { useProgressMessage } from "../../lib/useProgressMessage";
import { invalidateTests, useDebounced } from "../../lib/hooks";
import Pagination from "../../components/Pagination";

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
  const [instructions, setInstructions] = useState("");
  const [testId, setTestId] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [rosterMsg, setRosterMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const Q_PAGE_SIZE = 20;
  const [qSummary, setQSummary] = useState({
    total: 0,
    approved: 0,
    pending: 0,
    topics: [] as { topic: string; count: number }[],
  });
  const [qPage, setQPage] = useState(1);
  const [qTotal, setQTotal] = useState(0); // questions matching the current filters
  const [qTotalPages, setQTotalPages] = useState(1);
  const [qStatus, setQStatus] = useState<"all" | "approved" | "pending">("all");
  const [qTopicFilter, setQTopicFilter] = useState("");
  const [qSearch, setQSearch] = useState("");
  const debouncedQSearch = useDebounced(qSearch.trim(), 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qTopic, setQTopic] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const [editText, setEditText] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrect, setEditCorrect] = useState(0);
  const [editTopic, setEditTopic] = useState("");

  const [savingEdit, setSavingEdit] = useState(false);

  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [aiCount, setAiCount] = useState(10);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [perStudent, setPerStudent] = useState(""); // "" = every student gets every question
  const [marks, setMarks] = useState<1 | 2>(1);

  const aiMessages = useMemo(() => {
    const topicList = topics.split(",").map((s) => s.trim()).filter(Boolean)
    return [
      "Reading your topics…",
      ...topicList.map((t) => `Researching “${t}”…`),
      "Drafting questions…",
      "Writing answer options…",
      "Checking the correct answers…",
      "Combining everything into a test…",
      "Almost there…",
      "Taking a little longer than usual…", // shown if Gemini is busy and we're retrying
    ];
  }, [topics]);

  const aiMessage = useProgressMessage(aiLoading, aiMessages, 2500);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  async function refreshQuestions(id: string) {
    const res = await api.listQuestions(id, {
      page: qPage,
      pageSize: Q_PAGE_SIZE,
      status: qStatus,
      topic: qTopicFilter,
      q: debouncedQSearch,
    });
    setQuestions(res.questions);
    setQSummary(res.summary);
    setQTotal(res.total);
    setQTotalPages(res.totalPages);
    if (res.page > res.totalPages) setQPage(res.totalPages); // e.g. after deleting the last item on a page
  }

  useEffect(() => {
    if (testId) refreshQuestions(testId).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, qPage, qStatus, qTopicFilter, debouncedQSearch]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setError(null);
    setCreating(true);

    try {
      const { test, accessCode } = await api.createTest({
        title,
        topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
        loginWindowStart: new Date(start).toISOString(),
        loginWindowEnd: new Date(end).toISOString(),
        durationMinutes: duration,
        instructions: instructions.trim(),
        requiresAccessCode: true,
      });
      setTestId(test.id);
      setLinkToken(test.linkToken);
      setAccessCode(accessCode);
      setQTopic(topics.split(",")[0]?.trim() ?? "");
      invalidateTests();
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false);
    }
    
  }

  async function handleRoster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!testId || !file) return;
    try {
      const result = await api.uploadRoster(testId, file);
      setRosterMsg(
        `${result.acceptedCount} student(s) added (${result.namesAdded} with names), ${result.rejectedCount} row(s) rejected.` + (result.ignoredNameCount > 0 ? ` ${result.ignoredNameCount} name(s) ignored for unsupported characters.` : "")
      );
      invalidateTests();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleGenerateAI() {
    if (!testId) return;
    setError(null);
    setAiNote(null);
    setAiLoading(true);
    try {
      const res = await api.generateQuestions(testId, aiCount);
      if (res.count < res.requested) {
        setAiNote(`Generated ${res.count} of ${res.requested}. Some were invalid and skipped.`);
      }
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!testId) return;
    setError(null);
    try {
      await api.addManualQuestion(testId, {
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

  function startEditingQuestion(q: QuestionRow) {
    setEditingQuestionId(q.id);
    setEditText(q.text);
    setEditOptions([...q.options]);
    setEditCorrect(q.correctOptionIndex);
    setEditTopic(q.topic);
    setError(null);
  }

  async function handleSaveQuestion() {

    if (!testId || !editingQuestionId) {
      return;
    }

    setError(null);
    setSavingEdit(true);

    try {
      const options = editOptions.map((option) => option.trim());

      if (!editText.trim()) {
        throw new Error("Question text is required");
      }

      if (options.length < 2) {
        throw new Error("At least two options are required");
      }

      if (options.some((option) => !option)) {
        throw new Error("All options must contain text");
      }

      if (!editTopic.trim()) {
        throw new Error("Topic is required");
      }

      if (editCorrect >= options.length) {
        throw new Error("Select a valid correct answer");
      }

      await api.updateQuestion(
        testId,
        editingQuestionId,
        {
          text: editText.trim(),
          options,
          correctOptionIndex: editCorrect,
          topic: editTopic.trim(),
        }
      );

      setEditingQuestionId(null);
      setEditText("");
      setEditOptions([]);
      setEditCorrect(0);
      setEditTopic("");

      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function changeFilter(apply: () => void) {
    apply();
    setQPage(1);
    setSelected(new Set()); // never act on rows the lecturer can no longer see
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = questions.every((q) => next.has(q.id));
      questions.forEach((q) => (allSelected ? next.delete(q.id) : next.add(q.id)));
      return next;
    });
  }

  async function handleDeleteQuestion(id: string) {
    if (!testId || !window.confirm("Delete this question? This cannot be undone.")) return;
    setError(null);
    try {
      await api.deleteQuestion(testId, id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  // scope "pending" acts on EVERY unapproved question in the test; otherwise on the selected rows.
  async function handleBulk(action: "approve" | "delete", scope?: "pending") {
    if (!testId) return;
    const ids = [...selected];
    if (!scope && ids.length === 0) return;
    if (action === "delete") {
      const message = scope
        ? `Delete all ${unapprovedCount} pending questions? This cannot be undone.`
        : `Delete ${ids.length} selected question(s)? This cannot be undone.`;
      if (!window.confirm(message)) return;
    }
    setError(null);
    try {
      await api.bulkQuestions(testId, scope ? { action, all: scope } : { action, ids });
      setSelected(new Set());
      await refreshQuestions(testId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handlePublish() {
    if (!testId || publishing) return;
    setError(null);
    setPublishing(true);
    try {
      await api.updateSettings(testId, {
        questionsPerStudent: perStudent === "" ? null : Number(perStudent),
        marksPerQuestion: marks,
      });
      await api.generateLink(testId);
      setPublished(true);
      invalidateTests();
    } catch (err: any) {
      setError(err.message);
    }  finally {
      setPublishing(false);
    }
  }

  const approvedCount = qSummary.approved;
  const unapprovedCount = qSummary.pending;
  const allOnPageSelected = questions.length > 0 && questions.every((q) => selected.has(q.id));

  const perStudentNum = perStudent === "" ? null : Number(perStudent);
  const examSize = perStudentNum ? Math.min(perStudentNum, approvedCount) : approvedCount;
  const tooMany = perStudentNum !== null && perStudentNum > approvedCount;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-slate-800">Create test</h1>
          <button onClick={() => router.push("/lecturer/tests")} className="text-md text-slate-600 rounded-full w-8 h-8 bg-slate-100 font-bold">
            x
          </button>
        </div>
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
            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Instructions for students (optional)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="e.g. Closed book. Calculators allowed. Answer all questions."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">{instructions.length}/4000</p>
            </div>
            <button type="submit" disabled={creating}
              className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium disabled:opacity-50">
              {creating ? "Creating..." : "Create test"}
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
              <label className="block text-sm text-slate-600 mb-1">Upload roster (CSV: ID number, optional full name)</label>
              <input type="file" accept=".csv" onChange={handleRoster} className="w-full text-sm" />
              {rosterMsg && <p className="text-xs text-slate-500 mt-1">{rosterMsg}</p>}
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Questions</h2>

              <div className="mb-2 flex items-center gap-2">
                <label htmlFor="ai-count" className="text-xs text-slate-600">
                  Questions to generate
                </label>
                <input
                  id="ai-count"
                  type="number"
                  min={1}
                  max={40}
                  value={aiCount}
                  onChange={(e) => setAiCount(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
                <span className="text-xs text-slate-400">spread across your topics</span>
              </div>

              <button
                onClick={handleGenerateAI}
                disabled={aiLoading}
                className={`w-full rounded-lg border py-2 text-sm font-medium mb-4 flex items-center justify-center gap-2 ${
                  aiLoading
                    ? "cursor-wait border-violet-200 bg-violet-50 text-violet-700"
                    : "border-slate-300 text-slate-700 disabled:opacity-50"
                }`}
              >
                {aiLoading ? (
                  <>
                    <Spinner />
                    <span key={aiMessage} className="fade-in" aria-live="polite">
                      {aiMessage}
                    </span>
                  </>
                ) : (
                  "Generate questions with AI"
                )}
              </button>

              {aiNote && <p className="mb-3 text-xs text-amber-700">{aiNote}</p>}

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

              {qSummary.total > 0 && (
                <div className="space-y-2">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {aiLoading
                          ? "New questions will appear below"
                          : `${approvedCount} approved, ${unapprovedCount} pending review (${qSummary.total} total)`}
                      </p>
                      {!aiLoading && unapprovedCount > 0 && (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => handleBulk("approve", "pending")}
                            className="text-xs font-medium text-emerald-700 underline"
                          >
                            Approve all pending
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBulk("delete", "pending")}
                            className="text-xs font-medium text-red-600 underline"
                          >
                            Delete all pending
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={qSearch}
                        onChange={(e) => changeFilter(() => setQSearch(e.target.value))}
                        placeholder="Search questions..."
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                      />
                      <select
                        value={qStatus}
                        onChange={(e) => changeFilter(() => setQStatus(e.target.value as typeof qStatus))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        <option value="all">All</option>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                      </select>
                      <select
                        value={qTopicFilter}
                        onChange={(e) => changeFilter(() => setQTopicFilter(e.target.value))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">All topics</option>
                        {qSummary.topics.map((t) => (
                          <option key={t.topic} value={t.topic}>
                            {t.topic} ({t.count})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-slate-600">
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} />
                        Select this page
                      </label>
                      {selected.size > 0 && (
                        <>
                          <span className="text-slate-400">{selected.size} selected</span>
                          <button type="button" onClick={() => handleBulk("approve")} className="font-medium text-emerald-700 hover:underline">
                            Approve selected
                          </button>
                          <button type="button" onClick={() => handleBulk("delete")} className="font-medium text-red-600 hover:underline">
                            Delete selected
                          </button>
                          <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                    {questions.map((q) => (
                      <li key={q.id} className="p-3 text-sm">
                        {editingQuestionId === q.id ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">
                                Question
                              </label>

                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="block text-xs text-slate-500 mb-1">
                                Options
                              </label>

                              <div className="space-y-2">
                                {editOptions.map((option, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name={`correct-${q.id}`}
                                      checked={editCorrect === i}
                                      onChange={() => setEditCorrect(i)}
                                      title="Mark as correct answer"
                                    />

                                    <input
                                      value={option}
                                      onChange={(e) => {
                                        const next = [...editOptions];
                                        next[i] = e.target.value;
                                        setEditOptions(next);
                                      }}
                                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                      placeholder={`Option ${i + 1}`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs text-slate-500 mb-1">
                                Topic
                              </label>

                              <input
                                value={editTopic}
                                onChange={(e) => setEditTopic(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleSaveQuestion}
                                disabled={savingEdit}
                                className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                              >
                                {savingEdit ? "Saving..." : "Save changes"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestionId(null);
                                  setError(null);
                                }}
                                disabled={savingEdit}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <label className="flex items-start gap-2 text-slate-800">
                                <input
                                  type="checkbox"
                                  checked={selected.has(q.id)}
                                  onChange={() => toggleSelect(q.id)}
                                  className="mt-1"
                                  aria-label="Select question"
                                />
                                <span>{q.text}</span>
                              </label>

                              <span
                                className={`text-xs shrink-0 rounded-full px-2 py-0.5 ${
                                  q.approved
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {q.approved ? "approved" : "pending"}
                              </span>
                            </div>

                            <ul className="mt-1 text-xs text-slate-500 list-disc list-inside">
                              {q.options.map((o, i) => (
                                <li
                                  key={i}
                                  className={
                                    i === q.correctOptionIndex
                                      ? "text-emerald-700 font-medium"
                                      : ""
                                  }
                                >
                                  {o}
                                </li>
                              ))}
                            </ul>

                            <div className="mt-2 flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => startEditingQuestion(q)}
                                className="text-xs font-medium text-violet-700 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q.id)}
                                className="text-xs font-medium text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                    {aiLoading && <QuestionSkeletonRows count={4} />}
                  </ul>
                  {!aiLoading && questions.length === 0 && (
                    <p className="py-3 text-center text-xs text-slate-400">No questions match your filters.</p>
                  )}
                  <Pagination
                    page={qPage}
                    totalPages={qTotalPages}
                    total={qTotal}
                    pageSize={Q_PAGE_SIZE}
                    onPageChange={setQPage}
                  />
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">Exam settings</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="per-student" className="block text-xs text-slate-600 mb-1">
                    Questions per student
                  </label>
                  <input
                    id="per-student"
                    type="number"
                    min={1}
                    value={perStudent}
                    placeholder={`All (${approvedCount})`}
                    onChange={(e) => setPerStudent(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="marks" className="block text-xs text-slate-600 mb-1">
                    Marks per question
                  </label>
                  <select
                    id="marks"
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value) as 1 | 2)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value={1}>1 mark</option>
                    <option value={2}>2 marks</option>
                  </select>
                </div>
              </div>
              <p className={`mt-2 text-xs ${tooMany ? "text-red-600" : "text-slate-500"}`}>
                {approvedCount === 0
                  ? "Approve some questions to see how big each student's exam will be."
                  : tooMany
                    ? `Only ${approvedCount} questions are approved, so each student cannot get ${perStudentNum}.`
                    : `Pool: ${approvedCount} approved. Each student gets ${examSize} question${examSize === 1 ? "" : "s"}, ${examSize * marks} marks in total.`}
              </p>
              <p className="mt-1 text-xs text-slate-400">Applied when you publish. Leave blank to give everyone every question.</p>
            </div>

            <button
              onClick={handlePublish}
              disabled={approvedCount === 0 || aiLoading || publishing || tooMany}
              className="w-full rounded-lg bg-emerald-700 text-white py-2 text-sm font-medium disabled:opacity-50"
            >
              {publishing ? "Publishing..." : "Publish test"}
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

function QuestionSkeletonRows({ count }: { count: number }) {
  const titleWidths = ["w-3/4", "w-2/3", "w-5/6", "w-1/2"];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <li key={`skeleton-${i}`} className="p-3" aria-hidden="true">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className={`h-4 ${titleWidths[i % titleWidths.length]}`} />
            <Skeleton className="h-5 w-16 rounded-full shrink-0" />
          </div>
          <div className="mt-2 space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-3 w-32" />
          </div>
        </li>
      ))}
    </>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}