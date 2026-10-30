import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ApiError, api } from "../../lib/api";
import { topicFromFileName } from "../../lib/topics";
import { Skeleton } from "../../components/Skeleton";
import { useProgressMessage } from "../../lib/useProgressMessage";
import { invalidateTests, useDebounced } from "../../lib/hooks";
import Pagination from "../../components/Pagination";
import PdfQuestions from "../../components/PdfQuestions";

type QuestionRow = {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
  topic: string;
  approved: boolean;
};

const TEMPLATE_CSV =
  "question,A,B,C,D,correct,topic\r\n" +
  "What does HTTP stand for?,HyperText Transfer Protocol,High Transfer Text Protocol,Hyper Transfer Text Process,Host Transfer Type Protocol,A,Networking\r\n" +
  "Which of these is a relational database?,MongoDB,PostgreSQL,Redis,Neo4j,B,Databases\r\n";

const ROSTER_REQUIRED_ERROR = "Upload a roster before publishing";

function downloadTemplate() {
  // The BOM at the start makes Excel open the file as UTF-8.
  const blob = new Blob(["\uFEFF" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "questions-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** ISO date to the "YYYY-MM-DDTHH:mm" local time that datetime-local inputs use. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateTest() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [aiTopics, setAiTopics] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState(20);
  const [instructions, setInstructions] = useState("");
  const [testId, setTestId] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [rosterMsg, setRosterMsg] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createFieldErrors, setCreateFieldErrors] = useState<
    Partial<Record<"title" | "instructions" | "loginWindowStart" | "loginWindowEnd" | "durationMinutes", string[]>>
  >({});
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [questionsUploadError, setQuestionsUploadError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [manualQuestionError, setManualQuestionError] = useState<string | null>(null);
  const [manualQuestionFieldErrors, setManualQuestionFieldErrors] = useState<
    Partial<Record<"text" | "options" | "correctOptionIndex" | "topic", string[]>>
  >({});
  const [editQuestionError, setEditQuestionError] = useState<string | null>(null);
  const [editQuestionFieldErrors, setEditQuestionFieldErrors] = useState<
    Partial<Record<"text" | "options" | "correctOptionIndex" | "topic", string[]>>
  >({});
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
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

  const [uploadTopic, setUploadTopic] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploadIssues, setUploadIssues] = useState<string[]>([]);

  const [rosterCount, setRosterCount] = useState(0);
  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [newCodeBusy, setNewCodeBusy] = useState(false);

  const aiMessages = useMemo(() => {
    const topicList = aiTopics.split(",").map((s) => s.trim()).filter(Boolean)
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
  }, [aiTopics]);

  const aiMessage = useProgressMessage(aiLoading, aiMessages, 2500);

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
    setQuestionsError(null);
    if (res.page > res.totalPages) setQPage(res.totalPages); // e.g. after deleting the last item on a page
  }

  useEffect(() => {
    if (testId) refreshQuestions(testId).catch((err) => setQuestionsError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, qPage, qStatus, qTopicFilter, debouncedQSearch]);

  // Opened as /lecturer/create-test?testId=...: pick up where the lecturer stopped.
  useEffect(() => {
    if (!router.isReady || testId) return;
    const id = router.query.testId;
    if (typeof id !== "string") return;

    setLoadingDraft(true);
    api
      .getTest(id)
      .then(({ test }) => {
        if (test.status === "published") {
          router.replace("/lecturer/tests"); // only drafts can be continued
          return;
        }
        setTestId(test.id);
        setTitle(test.title);
        setStart(toLocalInput(test.loginWindowStart));
        setEnd(toLocalInput(test.loginWindowEnd));
        setDuration(test.durationMinutes);
        setInstructions(test.instructions);
        setLinkToken(test.linkToken);
        setRosterCount(test.rosterCount);
        setPerStudent(test.questionsPerStudent ? String(test.questionsPerStudent) : "");
        setMarks(test.marksPerQuestion === 2 ? 2 : 1);
      })
      .catch((err) => setCreateError(err.message))
      .finally(() => setLoadingDraft(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.testId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    clearCreateErrors();
    setCreating(true);

    try {
      const { test, accessCode } = await api.createTest({
        title,
        loginWindowStart: new Date(start).toISOString(),
        loginWindowEnd: new Date(end).toISOString(),
        durationMinutes: duration,
        instructions: instructions.trim(),
        requiresAccessCode: true,
      });
      setTestId(test.id);
      setLinkToken(test.linkToken);
      setAccessCode(accessCode);
      setRosterCount(0);
      router.replace({ pathname: router.pathname, query: { testId: test.id } }, undefined, { shallow: true });
      invalidateTests();
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setCreateFieldErrors(err.fieldErrors);
      } else {
        setCreateError(err.message)
      }
    } finally {
      setCreating(false);
    }
    
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!testId || savingDetails) return;
    setCreateError(null);
    setSavingDetails(true);
    try {
      await api.updateTest(testId, {
        title,
        loginWindowStart: new Date(start).toISOString(),
        loginWindowEnd: new Date(end).toISOString(),
        durationMinutes: duration,
        instructions: instructions.trim(),
      });
      setEditingDetails(false);
      invalidateTests();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleNewCode() {
    if (!testId || newCodeBusy) return;
    setCreateError(null);
    setNewCodeBusy(true);
    try {
      const { accessCode: code } = await api.regenerateAccessCode(testId);
      setAccessCode(code);
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setNewCodeBusy(false);
    }
  }

  function clearCreateErrors() {
    setCreateError(null);
    setCreateFieldErrors({});
  }

  async function handleRoster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!testId || !file) return;
    setRosterError(null);
    setRosterMsg(null);
    setPublishError((current) => current === ROSTER_REQUIRED_ERROR ? null : current);
    try {
      const result = await api.uploadRoster(testId, file);
      setRosterCount(result.totalRosterSize);
      setRosterMsg(
        `${result.acceptedCount} student(s) added (${result.namesAdded} with names), ${result.rejectedCount} row(s) rejected.` + (result.ignoredNameCount > 0 ? ` ${result.ignoredNameCount} name(s) ignored for unsupported characters.` : "")
      );
      setPublishError((current) => current === ROSTER_REQUIRED_ERROR ? null : current);
      setRosterError(null);
      invalidateTests();
    } catch (err: any) {
      setRosterError(err.message);
    }
  }

  async function handleUploadQuestions(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again after fixing it
    if (!testId || !file) return;

    setQuestionsUploadError(null);
    setUploadMsg(null);
    setUploadIssues([]);
    setUploading(true);
    try {
      const r = await api.uploadQuestions(testId, file, uploadTopic.trim() || topicFromFileName(file.name));
      setUploadMsg(
        `${r.acceptedCount} question${r.acceptedCount === 1 ? "" : "s"} added for review, ${r.rejectedCount} row${
          r.rejectedCount === 1 ? "" : "s"
        } skipped.`
      );
      setUploadIssues(r.rejectedReasons);

      // Show the new (pending) questions straight away.
      const alreadyThere = qStatus === "pending" && qPage === 1 && !qTopicFilter && !qSearch;
      if (alreadyThere) {
        await refreshQuestions(testId);
      } else {
        changeFilter(() => {
          setQStatus("pending");
          setQTopicFilter("");
          setQSearch("");
        });
      }
    } catch (err: any) {
      setQuestionsUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function showNewQuestions() {
    if (!testId) return;
    const alreadyThere = qStatus === "pending" && qPage === 1 && !qTopicFilter && !qSearch;
    if (alreadyThere) {
      await refreshQuestions(testId);
    } else {
      changeFilter(() => {
        setQStatus("pending");
        setQTopicFilter("");
        setQSearch("");
      });
    }
  }

  async function handleGenerateAI() {
    if (!testId) return;
    const topicList = aiTopics.split(",").map((s) => s.trim()).filter(Boolean);
    if (topicList.length === 0) {
      setAiError("Enter at least one topic to generate questions about.");
      return;
    }
    setAiError(null);
    setAiNote(null);
    setAiLoading(true);
    try {
      const res = await api.generateQuestions(testId, { topics: topicList, count: aiCount });
      if (res.count < res.requested) {
        setAiNote(`Generated ${res.count} of ${res.requested}. Some were invalid and skipped.`);
      }
      await refreshQuestions(testId);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!testId) return;
    clearManualQuestionErrors();
    try {
      await api.addManualQuestion(testId, {
        text: qText,
        options: qOptions.filter((o) => o.trim().length > 0),
        correctOptionIndex: qCorrect,
        topic: qTopic.trim(),
      });
      setQText("");
      setQOptions(["", "", "", ""]);
      setQCorrect(0);
      await refreshQuestions(testId);
    } catch (err: any) {
      if (err instanceof ApiError && err.fieldErrors) {
        setManualQuestionFieldErrors(err.fieldErrors);
      } else {
        setManualQuestionError(err.message);
      }
    } 
  }

  function clearManualQuestionErrors() {
    setManualQuestionError(null);
    setManualQuestionFieldErrors({});
  }

  function startEditingQuestion(q: QuestionRow) {
    setEditingQuestionId(q.id);
    setEditText(q.text);
    setEditOptions([...q.options]);
    setEditCorrect(q.correctOptionIndex);
    setEditTopic(q.topic);
    clearEditQuestionErrors();
  }

  async function handleSaveQuestion() {

    if (!testId || !editingQuestionId) {
      return;
    }

    clearEditQuestionErrors();
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
      if (err instanceof ApiError && err.fieldErrors) {
        setEditQuestionFieldErrors(err.fieldErrors);
      } else {
        setEditQuestionError(err.message);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  function clearEditQuestionErrors() {
    setEditQuestionError(null);
    setEditQuestionFieldErrors({});
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
    setQuestionsError(null);
    try {
      await api.deleteQuestion(testId, id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await refreshQuestions(testId);
    } catch (err: any) {
      setQuestionsError(err.message);
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
    setQuestionsError(null);
    try {
      await api.bulkQuestions(testId, scope ? { action, all: scope } : { action, ids });
      setSelected(new Set());
      await refreshQuestions(testId);
    } catch (err: any) {
      setQuestionsError(err.message);
    }
  }

  async function handlePublish() {
    if (!testId || publishing) return;
    setPublishError(null);
    setRosterError(null);
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
      setPublishError(err.message);
      if (err.message === ROSTER_REQUIRED_ERROR) setRosterError(err.message);
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
      <div className="flex items-center justify-between mb-6 fixed top-0 left-0 right-0 bg-slate-50 border-b border-slate-200 px-4 py-4 z-10">
        <h1 className="text-lg font-semibold text-slate-800">{testId ? "Edit draft" : "Create test"}</h1>
        <button onClick={() => router.push("/lecturer/tests")} className="text-md text-slate-600 rounded-full w-8 h-8 bg-slate-100 font-bold">
          x
        </button>
      </div>
      <div className="mt-16">
        {(!testId || editingDetails) && (
          <div className="max-w-2xl mx-auto mt-5 bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            {loadingDraft && <p className="text-sm text-slate-500">Loading your draft…</p>}
            {!loadingDraft && (!testId || editingDetails) && (
              <form onSubmit={testId ? handleSaveDetails : handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Title</label>
                  <input value={title} 
                    onChange={(e) => {
                      setTitle(e.target.value);
                      clearCreateErrors();
                    }} required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" 
                  />
                  <ErrorMessage message={createFieldErrors.title?.join("; ") ?? null} />
                </div> 
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Login window start</label>
                      <input type="datetime-local" value={start} onChange={(e) => {
                        setStart(e.target.value);
                        clearCreateErrors();
                      }} required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <ErrorMessage message={createFieldErrors.loginWindowStart?.join("; ") ?? null} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">Login window end</label>
                    <input type="datetime-local" value={end} onChange={(e) => {
                      setEnd(e.target.value);
                      clearCreateErrors();
                    }} required
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <ErrorMessage message={createFieldErrors.loginWindowEnd?.join("; ") ?? null} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Duration per student (minutes)</label>
                  <input type="number" min={1} max={480} value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value));
                      clearCreateErrors();
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <ErrorMessage message={createFieldErrors.durationMinutes?.join("; ") ?? null} />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Instructions for students (optional)
                  </label>
                  <textarea
                    value={instructions}
                    onChange={(e) => {
                      setInstructions(e.target.value);
                      clearCreateErrors();
                    }}
                    rows={5}
                    maxLength={4000}
                    placeholder="e.g. Closed book. Calculators allowed. Answer all questions."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-slate-400">{instructions.length}/4000</p>
                  <ErrorMessage message={createFieldErrors.instructions?.join("; ") ?? null} />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={creating || savingDetails}
                    className="flex-1 rounded-lg bg-slate-900 text-white py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {testId ? (savingDetails ? "Saving..." : "Save changes") : creating ? "Creating..." : "Create test"}
                  </button>
                  {testId && (
                    <button
                      type="button"
                      onClick={() => setEditingDetails(false)}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <ErrorMessage message={createError} />
              </form>
            )}
          </div>
        )}
      </div>

      {testId && !published && (
        <div className="space-y-6 w-full mx-auto mt-5 bg-white rounded-xl shadow-sm border border-slate-200 p-8 ">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="mt-6">
              {!editingDetails && (
                <div className="rounded-lg border border-slate-200 p-4 text-sm mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-800">{title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Opens {new Date(start).toLocaleString()} · closes {new Date(end).toLocaleString()} ·{" "}
                        {duration} min per student
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDetails(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-xs font-medium text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50"
                    >
                      Edit details
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
                <p className="font-medium mb-1">Access code (share once, out-of-band)</p>
                {accessCode ? (
                  <>
                    <p className="font-mono text-lg tracking-widest">{accessCode}</p>
                    <p className="mt-1 text-xs">
                      Won&apos;t be shown again. Distribute alongside the roster, not with the link.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs">
                      The code was shown once when this test was created and can&apos;t be shown again. If you
                      didn&apos;t keep it, make a new one (the old code then stops working).
                    </p>
                    <button
                      type="button"
                      onClick={handleNewCode}
                      disabled={newCodeBusy}
                      className="mt-2 text-xs font-medium underline disabled:opacity-50"
                    >
                      {newCodeBusy ? "Generating..." : "Generate a new access code"}
                    </button>
                  </>
                )}
              </div>

              <div className="mt-6">
                <label className="block text-sm text-slate-600 mb-1">Upload roster (CSV: ID number, optional full name)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleRoster}
                  className="w-full text-sm"
                  aria-invalid={Boolean(rosterError)}
                />
                <ErrorMessage message={rosterError} />
                {rosterMsg && <p className="text-xs text-slate-500 mt-1">{rosterMsg}</p>}
                {rosterCount > 0 && (
                  <p className="text-xs text-slate-500 mt-1">{rosterCount} student(s) on the roster so far.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-6 mt-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-3">Questions</h2>
                <ErrorMessage message={questionsError} />

                <div className="my-2 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                  <div className="mb-2">
                    <label htmlFor="ai-topics" className="mb-1 block text-xs text-slate-600">
                      Topics (comma-separated)
                    </label>
                    <input
                      id="ai-topics"
                      value={aiTopics}
                      onChange={(e) => {
                        setAiTopics(e.target.value);
                        setAiError(null);
                      }}
                      placeholder="e.g. Networking, Databases, Security"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mb-2 flex flex-col items-start gap-1">
                  <label htmlFor="ai-count" className="text-xs text-slate-600">
                    Questions to generate
                  </label>
                    <input
                      id="ai-count"
                      type="number"
                      min={1}
                      max={100}
                      value={aiCount}
                      onChange={(e) => {
                        setAiCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)));
                        setAiError(null);
                      }}
                      className="w-20 rounded-lg border border-slate-300 p-2 text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGenerateAI}
                  disabled={aiLoading || !aiTopics.trim()}
                  className={`w-full rounded-lg border py-2 text-sm font-medium mt-6 flex items-center justify-center gap-2 ${
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

                <ErrorMessage message={aiError} />
                {aiNote && <p className="mb-3 text-xs text-amber-700">{aiNote}</p>}
              </div>

              <div className="rounded-xl border border-slate-200 p-6 mt-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-slate-800">Upload questions from a file</h3>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="text-xs font-medium text-violet-600 hover:underline"
                  >
                    Download template
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  CSV with a header row: question, A, B, C, D (up to F), correct (a letter), and an optional topic.
                  Uploaded questions wait for your review. In Excel use Save As, then &quot;CSV UTF-8&quot;.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                  <input
                    value={uploadTopic}
                    onChange={(e) => setUploadTopic(e.target.value)}
                    placeholder="Topic for rows without one (default: the file's name)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={uploading}
                    onChange={handleUploadQuestions}
                    className="text-xs"
                  />
                </div>
                {uploading && <p className="mt-2 text-xs text-slate-500">Uploading…</p>}
                <ErrorMessage message={questionsUploadError} />
                {uploadMsg && <p className="mt-2 text-xs text-slate-700">{uploadMsg}</p>}
                {uploadIssues.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                    {uploadIssues.slice(0, 10).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                    {uploadIssues.length > 10 && <li>…and {uploadIssues.length - 10} more</li>}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-6">    
              <PdfQuestions
                testId={testId}
                onChanged={showNewQuestions}
              />

              <form onSubmit={handleAddManual} className="space-y-2 my-4 bg-slate-50 rounded-lg p-5">
                <p className="text-xs font-medium text-slate-600 mb-1">Add a question manually</p>
                <input value={qText} onChange={(e) => {
                  setQText(e.target.value);
                  clearManualQuestionErrors();
                }} placeholder="Question text" required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <ErrorMessage message={manualQuestionFieldErrors.text?.join("; ") ?? null} />
                {qOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={qCorrect === i}
                      onChange={() => {
                        setQCorrect(i);
                        clearManualQuestionErrors();
                      }}
                      title="Mark as correct answer"
                    />
                    <input
                      value={opt}
                      onChange={(e) => {
                        const next = [...qOptions];
                        next[i] = e.target.value;
                        setQOptions(next);
                        clearManualQuestionErrors();
                      }}
                      placeholder={`Option ${i + 1}`}
                      required={i < 2}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                ))}
                <ErrorMessage message={manualQuestionFieldErrors.options?.join("; ") ?? null} />
                <ErrorMessage message={manualQuestionFieldErrors.correctOptionIndex?.join("; ") ?? null} />
                <input value={qTopic} onChange={(e) => {
                  setQTopic(e.target.value);
                  clearManualQuestionErrors();
                }} placeholder="Topic (optional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <ErrorMessage message={manualQuestionFieldErrors.topic?.join("; ") ?? null} />
                <button type="submit" className="w-full rounded-lg bg-slate-800 text-white py-2 text-sm font-medium">
                  Add question
                </button>
                <ErrorMessage message={manualQuestionError} />
              </form>
            </div>

            
          </div>
          <div className="pt-5">
            {qSummary.total > 0 && (
              <div className="space-y-2 border-t border-slate-200 pt-5">
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

                  <div className="flex justify-between items-center">
                    <input
                      value={qSearch}
                      onChange={(e) => changeFilter(() => setQSearch(e.target.value))}
                      placeholder="Search questions..."
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs max-w-xl"
                    />
                    <div>
                      <select
                        value={qStatus}
                        onChange={(e) => changeFilter(() => setQStatus(e.target.value as typeof qStatus))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs w-100 sm:w-auto"
                      >
                        <option value="all">All</option>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                      </select>
                      <select
                        value={qTopicFilter}
                        onChange={(e) => changeFilter(() => setQTopicFilter(e.target.value))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs w-100 sm:w-auto"
                      >
                        <option value="">All topics</option>
                        {qSummary.topics.map((t) => (
                          <option key={t.topic} value={t.topic}>
                            {t.topic} ({t.count})
                          </option>
                        ))}
                      </select>
                    </div>
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
                <ul className=" border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
                  {questions.map((q) => (
                    <li key={q.id} className="p-3 text-sm border border-slate-200 rounded-lg bg-slate-50">
                      {editingQuestionId === q.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              Question
                            </label>

                            <textarea
                              value={editText}
                              onChange={(e) => {
                                setEditText(e.target.value);
                                clearEditQuestionErrors();
                              }}
                              rows={3}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <ErrorMessage message={editQuestionFieldErrors.text?.join("; ") ?? null} />
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
                                    onChange={() => {
                                      setEditCorrect(i);
                                      clearEditQuestionErrors();
                                    }}
                                    title="Mark as correct answer"
                                  />

                                  <input
                                    value={option}
                                    onChange={(e) => {
                                      const next = [...editOptions];
                                      next[i] = e.target.value;
                                      setEditOptions(next);
                                      clearEditQuestionErrors();
                                    }}
                                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    placeholder={`Option ${i + 1}`}
                                  />
                                </div>
                              ))}
                            </div>
                            <ErrorMessage message={editQuestionFieldErrors.options?.join("; ") ?? null} />
                            <ErrorMessage message={editQuestionFieldErrors.correctOptionIndex?.join("; ") ?? null} />
                          </div>

                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              Topic
                            </label>

                            <input
                              value={editTopic}
                              onChange={(e) => {
                                setEditTopic(e.target.value);
                                clearEditQuestionErrors();
                              }}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <ErrorMessage message={editQuestionFieldErrors.topic?.join("; ") ?? null} />
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
                                clearEditQuestionErrors();
                              }}
                              disabled={savingEdit}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                          <ErrorMessage message={editQuestionError} />
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

            <div className="border-t border-slate-200 pt-5 mt-5">
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
              className="w-full rounded-lg bg-emerald-700 text-white py-2 text-sm font-medium disabled:opacity-50 mt-5"
            >
              {publishing ? "Publishing..." : "Publish test"}
            </button>
            <ErrorMessage message={publishError} />
            {approvedCount === 0 && (
              <p className="text-xs text-slate-400 mt-2">Add or approve at least one question to publish.</p>
            )}
          </div>
        </div>
      )}

      {testId && published && linkToken && (
          <div className="space-y-3 border border-slate-200 rounded-xl bg-white shadow-sm p-8 max-w-2xl mx-auto mt-5">
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
  );
}

function studentLoginUrl(linkToken: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/student/login?linkToken=${linkToken}`;
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="mt-2 text-xs text-red-600">{message}</p>;
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