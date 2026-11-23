import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ApiError, api, type SavedRosterSummary } from "../../lib/api";
import { topicFromFileName } from "../../lib/topics";
import { Skeleton } from "../../components/Skeleton";
import { useProgressMessage } from "../../lib/useProgressMessage";
import { invalidateTests, useDebounced } from "../../lib/hooks";
import Pagination from "../../components/Pagination";
import PdfQuestions from "../../components/PdfQuestions";
import LecturerLayout from "../../components/LecturerLayout";

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
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
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

  const [saveRoster, setSaveRoster] = useState(false);
  const [rosterName, setRosterName] = useState("");

  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [uploadingRoster, setUploadingRoster] = useState(false);
  const [rosterFileInputKey, setRosterFileInputKey] = useState(0);

  const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
  const [selectedSavedRosterId, setSelectedSavedRosterId] = useState("");
  const [loadingSavedRosters, setLoadingSavedRosters] = useState(false);
  const [applyingSavedRoster, setApplyingSavedRoster] = useState(false);
  const [savedRosterError, setSavedRosterError] = useState<string | null>(null);

  const [isEditingDraft, setIsEditingDraft] = useState(false);

  const [linkCopied, setLinkCopied] = useState(false);

  const selectedSavedRoster = savedRosters.find(
    (roster) => roster.id === selectedSavedRosterId
  );

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
    if (!testId) return;

    let cancelled = false;

    async function loadSavedRosters() {
      setLoadingSavedRosters(true);
      setSavedRosterError(null);

      try {
        const result = await api.listSavedRosters();

        if (!cancelled) {
          setSavedRosters(result.rosters);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSavedRosterError(
            err.message || "Failed to load saved rosters."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSavedRosters(false);
        }
      }
    }

    loadSavedRosters();

    return () => {
      cancelled = true;
    };
  }, [testId]);

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
        setIsEditingDraft(true);
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

  async function handleApplySavedRoster(rosterId: string) {
    if (!testId || !rosterId || applyingSavedRoster) return;

    setApplyingSavedRoster(true);
    setSavedRosterError(null);
    setRosterError(null);
    setRosterMsg(null);

    try {
      const result = await api.applySavedRoster(testId, rosterId);

      setRosterCount(result.totalRosterSize);

      setRosterMsg(
        `${result.acceptedCount} student(s) added from "${result.rosterName}" (${result.namesAdded} with names).`
      );

      setPublishError((current) =>
        current === ROSTER_REQUIRED_ERROR ? null : current
      );

      invalidateTests();
    } catch (err: any) {
      setSavedRosterError(
        err.message || "Failed to apply saved roster."
      );
    } finally {
      setApplyingSavedRoster(false);
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

  function handleRosterFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0] ?? null;

    setRosterFile(file);
    setRosterError(null);
    setRosterMsg(null);
  }

  async function handleRosterUpload() {
    if (!testId || !rosterFile || uploadingRoster) return;

    if (saveRoster && rosterName.trim().length < 2) {
      setRosterError("Please enter a roster name of at least 2 characters.");
      return;
    }

    setRosterError(null);
    setRosterMsg(null);

    setPublishError((current) =>
      current === ROSTER_REQUIRED_ERROR ? null : current
    );

    setUploadingRoster(true);

    try {
      const result = await api.uploadRoster(
        testId,
        rosterFile,
        saveRoster,
        rosterName.trim()
      );

      setRosterCount(result.totalRosterSize);

      setRosterMsg(
        `${result.acceptedCount} student(s) added (${result.namesAdded} with names), ${result.rejectedCount} row(s) rejected.` +
          (result.ignoredNameCount > 0
            ? ` ${result.ignoredNameCount} name(s) ignored for unsupported characters.`
            : "")
      );

      if (result.savedRoster) {
        setRosterMsg(
          (current) =>
            `${current} Saved as "${result.savedRoster!.name}" for future use.`
        );

        setSelectedSavedRosterId(result.savedRoster.id);

        // Refresh saved rosters without treating a refresh failure
        // as an upload failure.
        try {
          const saved = await api.listSavedRosters();
          setSavedRosters(saved.rosters);
          setSavedRosterError(null);
        } catch (err: any) {
          setSavedRosterError(
            err.message || "Roster saved, but the saved roster list could not refresh."
          );
        }
      }

      setPublishError((current) =>
        current === ROSTER_REQUIRED_ERROR ? null : current
      );

      setRosterError(null);

      // Reset the file selection after a successful upload.
      setRosterFile(null);
      setRosterFileInputKey((current) => current + 1);

      setSaveRoster(false);
      setRosterName("");

      invalidateTests();
    } catch (err: any) {
      setRosterError(err.message || "Failed to upload roster.");
    } finally {
      setUploadingRoster(false);
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
    setAiSuccess(null);
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
        setAiNote(`Only ${res.count} of ${res.requested} questions could be generated; invalid responses were skipped.`);
      }
      setAiSuccess(
        res.count > 0
          ? `Successfully generated ${res.count} question${res.count === 1 ? "" : "s"}. Review and approve them below.`
          : "No questions could be generated. Please try again or try different topics."
      );
      try {
        await refreshQuestions(testId);
      } catch (err: any) {
        setQuestionsError(err.message);
      }
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
      setTimeout(() => {
        setAiSuccess(null); 
        setAiNote(null);
      }, 5000); // hide the success message after a while
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
    <LecturerLayout>
      <div className="mx-auto max-w-7xl space-y-7 pb-12">
        {/* Page heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
              <button
                type="button"
                onClick={() => router.push("/lecturer/tests")}
                className="transition hover:text-blue-600"
              >
                All tests
              </button>
              <span>/</span>
              <span className="text-slate-600">
                {isEditingDraft ? "Edit draft" : "Create test"}
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {isEditingDraft ? "Continue your test" : "Create a new test"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Set up your exam, add students, prepare questions, and publish when ready.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/lecturer/tests")}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:self-auto"
          >
            <span aria-hidden="true">←</span>
            Back to tests
          </button>
        </div>

        {/* Loading draft */}
        {loadingDraft && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Spinner />
              <p className="text-sm text-slate-500">Loading your draft...</p>
            </div>
          </div>
        )}

        {/* Test details: shown before creation or while editing details */}
        {(!testId || editingDetails) && !loadingDraft && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg text-blue-700">
                  <span aria-hidden="true">✎</span>
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {testId ? "Test details" : "Start with the basics"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {testId
                      ? "Update the information for this draft."
                      : "Give your test a title and configure when students can access it."}
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={testId ? handleSaveDetails : handleCreate}
              className="space-y-5 p-5 sm:p-7"
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Test title
                </label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearCreateErrors();
                  }}
                  required
                  placeholder="e.g. CSC 301 — Database Management"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                <ErrorMessage message={createFieldErrors.title?.join("; ") ?? null} />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Login window starts
                  </label>
                  <input
                    type="datetime-local"
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      clearCreateErrors();
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                  <ErrorMessage message={createFieldErrors.loginWindowStart?.join("; ") ?? null} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Login window closes
                  </label>
                  <input
                    type="datetime-local"
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      clearCreateErrors();
                    }}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                  <ErrorMessage message={createFieldErrors.loginWindowEnd?.join("; ") ?? null} />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Duration per student
                </label>
                <div className="relative max-w-xs">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value));
                      clearCreateErrors();
                    }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-24 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    minutes
                  </span>
                </div>
                <ErrorMessage message={createFieldErrors.durationMinutes?.join("; ") ?? null} />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Instructions for students
                  <span className="ml-1 font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => {
                    setInstructions(e.target.value);
                    clearCreateErrors();
                  }}
                  rows={4}
                  maxLength={4000}
                  placeholder="e.g. Closed book. Calculators allowed. Answer all questions."
                  className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                <div className="mt-1 flex justify-between">
                  <ErrorMessage message={createFieldErrors.instructions?.join("; ") ?? null} />
                  <span className="ml-auto text-xs text-slate-400">
                    {instructions.length}/4000
                  </span>
                </div>
              </div>

              <ErrorMessage message={createError} />

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                {testId && (
                  <button
                    type="button"
                    onClick={() => setEditingDetails(false)}
                    className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}

                <button
                  type="submit"
                  disabled={creating || savingDetails}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {(creating || savingDetails) && <Spinner />}
                  {testId
                    ? savingDetails
                      ? "Saving changes..."
                      : "Save test details"
                    : creating
                      ? "Creating test..."
                      : "Create test and continue"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Main test workspace */}
        {testId && !published && !editingDetails && (
          <>
            {/* Test overview */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      Draft
                    </span>
                    <span className="text-xs text-slate-400">
                      Test setup
                    </span>
                  </div>
                  <h2 className="truncate text-lg font-bold text-slate-900">
                    {title}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Opens {new Date(start).toLocaleString()} · Closes{" "}
                    {new Date(end).toLocaleString()} · {duration} minutes per student
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingDetails(true)}
                  className="shrink-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  Edit test details
                </button>
              </div>

              <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <span aria-hidden="true">⌑</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-950">
                        Student access code
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-amber-800">
                        Share this separately from the student login link.
                      </p>
                    </div>
                  </div>

                  {accessCode ? (
                    <div className="flex items-center gap-3 self-start rounded-lg border border-amber-200 bg-white px-4 py-2 sm:self-auto">
                      <span className="font-mono text-lg font-bold tracking-[0.2em] text-slate-900">
                        {accessCode}
                      </span>
                      <span className="text-[10px] text-amber-700">NEW</span>
                    </div>
                  ) : (
                    <div className="sm:text-right">
                      <p className="mb-2 max-w-sm text-xs text-amber-800">
                        The original code is not shown again. Generate a new one if you did not save it.
                      </p>
                      <button
                        type="button"
                        onClick={handleNewCode}
                        disabled={newCodeBusy}
                        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        {newCodeBusy ? "Generating..." : "Generate new code"}
                      </button>
                    </div>
                  )}
                </div>
                <ErrorMessage message={createError} />
              </div>
            </section>

            {/* Setup columns */}
            <div className="grid items-start gap-6 xl:grid-cols-2">
              {/* Students and roster */}
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-lg text-violet-700">
                    <span aria-hidden="true">♙</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">Student roster</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Choose a saved roster or upload a CSV containing student IDs and optional names.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Use a saved roster
                  </label>

                  {loadingSavedRosters ? (
                    <p className="text-sm text-slate-500">Loading your saved rosters...</p>
                  ) : savedRosters.length > 0 ? (
                    <select
                      value={selectedSavedRosterId}
                      onChange={(e) => {
                        const rosterId = e.target.value;
                        setSelectedSavedRosterId(rosterId);
                        setSavedRosterError(null);
                        setRosterMsg(null);

                        if (rosterId) {
                          handleApplySavedRoster(rosterId);
                        }
                        // Clearing the selection does not remove students already added.
                      }}
                      disabled={applyingSavedRoster}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60"
                    >
                      <option value="">Select a saved roster</option>
                      {savedRosters.map((roster) => (
                        <option key={roster.id} value={roster.id}>
                          {roster.name} ({roster.studentCount} students)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm leading-6 text-slate-500">
                      You have no saved rosters yet. Upload a CSV and choose the save option below to reuse it later.
                    </p>
                  )}

                  {applyingSavedRoster && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-blue-600">
                      <Spinner /> Applying selected roster...
                    </p>
                  )}

                  {selectedSavedRoster && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <span aria-hidden="true">▤</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-blue-900">
                          {selectedSavedRoster.name}
                        </p>
                        <p className="text-xs text-blue-700">
                          {selectedSavedRoster.studentCount} students in saved roster
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-blue-700">
                        Selected
                      </span>
                    </div>
                  )}

                  <ErrorMessage message={savedRosterError} />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-slate-700">
                      Upload a roster
                    </label>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      CSV file
                    </span>
                  </div>

                  {selectedSavedRoster ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
                      <p className="text-sm font-medium text-slate-600">
                        A saved roster is selected
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Clear the selection above to upload a different CSV.
                      </p>
                    </div>
                  ) : (
                    <>
                      <input
                        key={rosterFileInputKey}
                        type="file"
                        accept=".csv"
                        onChange={handleRosterFileChange}
                        disabled={uploadingRoster}
                        aria-invalid={Boolean(rosterError)}
                        className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:border-blue-300"
                      />

                      {rosterFile && (
                        <p className="mt-2 text-xs text-slate-500">
                          Selected file: {rosterFile.name}
                        </p>
                      )}

                      <div className="mt-4 rounded-xl border border-slate-100 p-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={saveRoster}
                            onChange={(e) => setSaveRoster(e.target.checked)}
                            disabled={uploadingRoster}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          Save this roster for future use
                        </label>

                        {saveRoster && (
                          <div className="mt-3">
                            <label className="mb-1.5 block text-xs font-medium text-slate-600">
                              Give your roster a name
                            </label>
                            <input
                              type="text"
                              value={rosterName}
                              onChange={(e) => setRosterName(e.target.value)}
                              placeholder="e.g. CSC 301 - 300 Level"
                              maxLength={100}
                              disabled={uploadingRoster}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                            />
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleRosterUpload}
                        disabled={!rosterFile || uploadingRoster}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploadingRoster && <Spinner />}
                        {uploadingRoster ? "Uploading roster..." : "Upload student roster"}
                      </button>
                    </>
                  )}

                  <ErrorMessage message={rosterError} />
                  {rosterMsg && (
                    <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                      {rosterMsg}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <span className="text-xs font-medium text-slate-500">
                      Students on this test
                    </span>
                    <span className="text-lg font-bold tabular-nums text-slate-900">
                      {rosterCount}
                    </span>
                  </div>
                </div>
              </section>

              {/* AI question generation */}
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-lg text-violet-700">
                    <span aria-hidden="true">✧</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">Generate with AI</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Generate draft multiple-choice questions from the topics you provide. You can review them before publishing.
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="ai-topics" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Topics
                  </label>
                  <textarea
                    id="ai-topics"
                    value={aiTopics}
                    onChange={(e) => {
                      setAiTopics(e.target.value);
                      setAiError(null);
                      setAiNote(null);
                      setAiSuccess(null);
                    }}
                    rows={3}
                    placeholder="e.g. Networking, Databases, Cybersecurity"
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Separate multiple topics with commas.
                  </p>
                </div>

                <div>
                  <label htmlFor="ai-count" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Number of questions
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
                      setAiNote(null);
                      setAiSuccess(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 sm:max-w-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={aiLoading || !aiTopics.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Spinner />
                      <span key={aiMessage} className="fade-in" aria-live="polite">
                        {aiMessage}
                      </span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">✧</span>
                      Generate questions
                    </>
                  )}
                </button>

                <ErrorMessage message={aiError} />
                {aiSuccess && (
                  <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">
                    {aiSuccess}
                  </p>
                )}
                {aiNote && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    {aiNote}
                  </p>
                )}
              </section>
            </div>

            {/* Add questions */}
            <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div>
                <h2 className="font-semibold text-slate-900">Add questions</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Use a CSV file, extract questions from a PDF, or create a question manually.
                </p>
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-2">
                {/* CSV upload */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">
                      Import from CSV
                    </h3>
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Download template
                    </button>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Use a header row containing question, A, B, C, D (up to F), correct (a letter), and an optional topic. Imported questions will be pending review.
                  </p>

                  <div className="mt-4 space-y-3">
                    <input
                      value={uploadTopic}
                      onChange={(e) => setUploadTopic(e.target.value)}
                      placeholder="Default topic for rows without one"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />

                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={uploading}
                      onChange={handleUploadQuestions}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                    />

                    {uploading && (
                      <p className="flex items-center gap-2 text-xs text-blue-600">
                        <Spinner /> Uploading questions...
                      </p>
                    )}

                    <ErrorMessage message={questionsUploadError} />

                    {uploadMsg && (
                      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
                        {uploadMsg}
                      </p>
                    )}

                    {uploadIssues.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-amber-700">
                        {uploadIssues.slice(0, 10).map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                        {uploadIssues.length > 10 && (
                          <li>...and {uploadIssues.length - 10} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>

                {/* PDF upload */}
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    Import from PDF
                  </h3>
                  <p className="mb-4 text-xs leading-5 text-slate-500">
                    Extract questions from a PDF document using the PDF question tool.
                  </p>
                  <PdfQuestions testId={testId} onChanged={showNewQuestions} />
                </div>
              </div>

              {/* Manual question form */}
              <form
                onSubmit={handleAddManual}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
              >
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Add a question manually
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter the question, its answer options, and select the correct answer.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Question text
                    </label>
                    <textarea
                      value={qText}
                      onChange={(e) => {
                        setQText(e.target.value);
                        clearManualQuestionErrors();
                      }}
                      placeholder="Enter your question..."
                      rows={3}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                    <ErrorMessage message={manualQuestionFieldErrors.text?.join("; ") ?? null} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
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
                          aria-label={`Option ${i + 1} is the correct answer`}
                          className="h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <input
                          value={opt}
                          onChange={(e) => {
                            const next = [...qOptions];
                            next[i] = e.target.value;
                            setQOptions(next);
                            clearManualQuestionErrors();
                          }}
                          placeholder={`Option ${i + 1}${i < 2 ? " (required)" : ""}`}
                          required={i < 2}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        />
                      </div>
                    ))}
                  </div>

                  <ErrorMessage message={manualQuestionFieldErrors.options?.join("; ") ?? null} />
                  <ErrorMessage message={manualQuestionFieldErrors.correctOptionIndex?.join("; ") ?? null} />

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Topic
                      </label>
                      <input
                        value={qTopic}
                        onChange={(e) => {
                          setQTopic(e.target.value);
                          clearManualQuestionErrors();
                        }}
                        placeholder="e.g. Database Management"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      />
                      <ErrorMessage message={manualQuestionFieldErrors.topic?.join("; ") ?? null} />
                    </div>

                    <button
                      type="submit"
                      className="self-end rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Add question
                    </button>
                  </div>

                  <ErrorMessage message={manualQuestionError} />
                </div>
              </form>
            </section>

            {/* Question bank */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">Question bank</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Review, edit, approve, or remove questions before publishing.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-slate-900">
                        {qSummary.total}
                      </p>
                      <p className="text-[10px] font-medium text-slate-500">Total</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-emerald-700">
                        {approvedCount}
                      </p>
                      <p className="text-[10px] font-medium text-emerald-700">Approved</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-center">
                      <p className="text-lg font-bold tabular-nums text-amber-700">
                        {unapprovedCount}
                      </p>
                      <p className="text-[10px] font-medium text-amber-700">Pending</p>
                    </div>
                  </div>
                </div>
                <ErrorMessage message={questionsError} />
              </div>

              {qSummary.total > 0 ? (
                <div className="space-y-4 p-5 sm:p-6">
                  {aiLoading && (
                    <p className="text-xs text-violet-600">
                      New questions will appear here when generation finishes.
                    </p>
                  )}

                  {unapprovedCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                      <p className="text-xs text-amber-800">
                        {unapprovedCount} question{unapprovedCount === 1 ? "" : "s"} need your review.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleBulk("approve", "pending")}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Approve all pending
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulk("delete", "pending")}
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Delete all pending
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={qSearch}
                      onChange={(e) => changeFilter(() => setQSearch(e.target.value))}
                      placeholder="Search questions..."
                      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />

                    <select
                      value={qStatus}
                      onChange={(e) => changeFilter(() => setQStatus(e.target.value as typeof qStatus))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-blue-500"
                    >
                      <option value="all">All statuses</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                    </select>

                    <select
                      value={qTopicFilter}
                      onChange={(e) => changeFilter(() => setQTopicFilter(e.target.value))}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-blue-500"
                    >
                      <option value="">All topics</option>
                      {qSummary.topics.map((t) => (
                        <option key={t.topic} value={t.topic}>
                          {t.topic} ({t.count})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4 text-xs">
                    <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectPage}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                      Select this page
                    </label>

                    {selected.size > 0 && (
                      <>
                        <span className="text-slate-400">
                          {selected.size} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => handleBulk("approve")}
                          className="font-semibold text-emerald-700 hover:underline"
                        >
                          Approve selected
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulk("delete")}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Delete selected
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(new Set())}
                          className="text-slate-500 hover:underline"
                        >
                          Clear selection
                        </button>
                      </>
                    )}
                  </div>

                  <ul className="grid gap-3 lg:grid-cols-2">
                    {questions.map((q) => (
                      <li
                        key={q.id}
                        className="min-w-0 rounded-xl border border-slate-200 p-4 transition hover:border-slate-300"
                      >
                        {editingQuestionId === q.id ? (
                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Question
                              </label>
                              <textarea
                                value={editText}
                                onChange={(e) => {
                                  setEditText(e.target.value);
                                  clearEditQuestionErrors();
                                }}
                                rows={3}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              />
                              <ErrorMessage message={editQuestionFieldErrors.text?.join("; ") ?? null} />
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-medium text-slate-600">
                                Answer options — select the correct answer
                              </p>
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
                                      className="h-4 w-4 accent-emerald-600"
                                    />
                                    <input
                                      value={option}
                                      onChange={(e) => {
                                        const next = [...editOptions];
                                        next[i] = e.target.value;
                                        setEditOptions(next);
                                        clearEditQuestionErrors();
                                      }}
                                      placeholder={`Option ${i + 1}`}
                                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                    />
                                  </div>
                                ))}
                              </div>
                              <ErrorMessage message={editQuestionFieldErrors.options?.join("; ") ?? null} />
                              <ErrorMessage message={editQuestionFieldErrors.correctOptionIndex?.join("; ") ?? null} />
                            </div>

                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">
                                Topic
                              </label>
                              <input
                                value={editTopic}
                                onChange={(e) => {
                                  setEditTopic(e.target.value);
                                  clearEditQuestionErrors();
                                }}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                              />
                              <ErrorMessage message={editQuestionFieldErrors.topic?.join("; ") ?? null} />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={handleSaveQuestion}
                                disabled={savingEdit}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                            <ErrorMessage message={editQuestionError} />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selected.has(q.id)}
                                onChange={() => toggleSelect(q.id)}
                                aria-label="Select question"
                                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                                    q.approved
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-amber-50 text-amber-700"
                                  }`}>
                                    {q.approved ? "Approved" : "Pending review"}
                                  </span>
                                  {q.topic && (
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                                      {q.topic}
                                    </span>
                                  )}
                                </div>

                                <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">
                                  {q.text}
                                </p>

                                <ol className="mt-3 space-y-2">
                                  {q.options.map((o, i) => (
                                    <li
                                      key={i}
                                      className={`flex items-start gap-2 text-xs leading-5 ${
                                        i === q.correctOptionIndex
                                          ? "font-semibold text-emerald-700"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] ${
                                        i === q.correctOptionIndex
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-100 text-slate-500"
                                      }`}>
                                        {String.fromCharCode(65 + i)}
                                      </span>
                                      <span>{o}</span>
                                      {i === q.correctOptionIndex && (
                                        <span className="ml-auto shrink-0 text-[10px]">
                                          Correct
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ol>

                                <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => startEditingQuestion(q)}
                                    className="text-xs font-semibold text-blue-600 hover:underline"
                                  >
                                    Edit question
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuestion(q.id)}
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </li>
                    ))}

                    {aiLoading && <QuestionSkeletonRows count={4} />}
                  </ul>

                  {!aiLoading && questions.length === 0 && (
                    <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      No questions match your filters.
                    </p>
                  )}

                  <Pagination
                    page={qPage}
                    totalPages={qTotalPages}
                    total={qTotal}
                    pageSize={Q_PAGE_SIZE}
                    onPageChange={setQPage}
                  />
                </div>
              ) : (
                <div className="px-5 py-12 text-center sm:px-6">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">
                    ?
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-slate-800">
                    Your question bank is empty
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                    Generate questions with AI, import them from a CSV or PDF, or add them manually. Your questions will appear here.
                  </p>
                </div>
              )}
            </section>

            {/* Exam settings and publishing */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700">
                    <span aria-hidden="true">✓</span>
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">Exam settings</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Decide how questions and marks are distributed to students.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="per-student" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Questions per student
                    </label>
                    <input
                      id="per-student"
                      type="number"
                      min={1}
                      value={perStudent}
                      placeholder={`All (${approvedCount})`}
                      onChange={(e) => setPerStudent(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                    <p className="mt-1.5 text-xs text-slate-400">
                      Leave blank to give every student all approved questions.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="marks" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Marks per question
                    </label>
                    <select
                      id="marks"
                      value={marks}
                      onChange={(e) => setMarks(Number(e.target.value) as 1 | 2)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    >
                      <option value={1}>1 mark</option>
                      <option value={2}>2 marks</option>
                    </select>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${
                  tooMany
                    ? "border-red-200 bg-red-50"
                    : "border-blue-100 bg-blue-50/70"
                }`}>
                  <p className={`text-sm font-semibold ${
                    tooMany ? "text-red-800" : "text-blue-900"
                  }`}>
                    Exam summary
                  </p>
                  <p className={`mt-1 text-xs leading-5 ${
                    tooMany ? "text-red-700" : "text-blue-800"
                  }`}>
                    {approvedCount === 0
                      ? "Approve some questions to see the exam summary."
                      : tooMany
                        ? `Only ${approvedCount} questions are approved. Each student cannot receive ${perStudentNum} questions.`
                        : `Question pool: ${approvedCount} approved. Each student receives ${examSize} question${examSize === 1 ? "" : "s"}, worth ${examSize * marks} marks in total.`}
                  </p>
                </div>

                <div className="space-y-2">
                  {rosterCount === 0 && (
                    <p className="text-xs text-amber-700">
                      Add a student roster before publishing.
                    </p>
                  )}
                  {unapprovedCount > 0 && (
                    <p className="text-xs text-amber-700">
                      {unapprovedCount} question{unapprovedCount === 1 ? "" : "s"} still pending. Approve or delete{" "}
                      {unapprovedCount === 1 ? "it" : "them"} before publishing.
                    </p>
                  )}
                  <ErrorMessage message={publishError} />
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-lg text-xs leading-5 text-slate-500">
                    Publishing makes the test available to students during the login window. Review your roster, questions, and settings before continuing.
                  </p>

                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={
                      approvedCount === 0 ||
                      unapprovedCount > 0 ||
                      aiLoading ||
                      publishing ||
                      tooMany
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishing && <Spinner />}
                    {publishing ? "Publishing test..." : "Publish test"}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* Published confirmation */}
        {testId && published && linkToken && (
          <section className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <div className="bg-emerald-50 px-6 py-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
                ✓
              </div>
              <h2 className="mt-4 text-xl font-bold text-emerald-950">
                Your test is published
              </h2>
              <p className="mt-2 text-sm text-emerald-800">
                Your test is ready. Share the student login link and access code separately.
              </p>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Student login link
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    readOnly
                    value={studentLoginUrl(linkToken)}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(studentLoginUrl(linkToken));
                        setLinkCopied(true);

                        setTimeout(() => {
                          setLinkCopied(false);
                        }, 2000);
                      } catch {
                        setLinkCopied(false);
                      }
                    }}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                      linkCopied
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {linkCopied ? "Copied!" : "Copy link"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Send this link and the access code through separate channels.
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push("/lecturer/tests")}
                  className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Go to all tests
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/lecturer/results/${testId}`)}
                  className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View test results
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </LecturerLayout>
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