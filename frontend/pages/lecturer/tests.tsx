
import { useEffect, useState } from "react";
import { mutate } from "swr";
import Link from "next/link";
import LecturerLayout from "../../components/LecturerLayout";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api";
import {
  useTests,
  keys,
  invalidateTests,
  clearResults,
} from "../../lib/hooks";
import Pagination from "../../components/Pagination";

type TestRow = {
  id: string;
  title: string;
  status: string;
  window: "opened" | "closed";
  windowState: "draft" | "scheduled" | "open" | "closed";
  loginWindowStart: string;
  loginWindowEnd: string;
  linkToken: string;
  rosterCount: number;
  createdAt: string;
};

const PAGE_SIZE = 10;


function studentLoginUrl(linkToken: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return `${origin}/student/login?linkToken=${linkToken}`;
}

export default function Tests() {
  const [page, setPage] = useState(1);

  const {
    data,
    isLoading: loading,
    isValidating,
  } = useTests(page, PAGE_SIZE);

  const tests = data?.tests ?? [];
  const totalPages = data?.totalPages ?? 1;

  const [newCode, setNewCode] = useState<{
    testId: string;
    code: string;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!error) return;

    const timeout = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    if (data && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  async function handleRegenerate(testId: string) {
    setError(null);
    setNewCode(null);
    setGeneratingId(testId);

    try {
      const { accessCode } = await api.regenerateAccessCode(testId);
      setNewCode({ testId, code: accessCode });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleCopy(testId: string, linkToken: string) {
    try {
      await navigator.clipboard.writeText(studentLoginUrl(linkToken));
      setCopiedId(testId);

      setTimeout(() => {
        setCopiedId((current) => (current === testId ? null : current));
      }, 2500);
    } catch {
      setError("Unable to copy the student link. Please copy it manually.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    const target = deleteTarget;

    setDeletingId(target.id);
    setError(null);

    // Optimistically remove the test from the current page.
    mutate(
      [keys.tests, page, PAGE_SIZE],
      (current: any) =>
        current && {
          ...current,
          tests: current.tests.filter(
            (test: TestRow) => test.id !== target.id
          ),
        },
      { revalidate: false }
    );

    clearResults(target.id);

    try {
      await api.deleteTest(target.id);
      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      invalidateTests();
      setDeletingId(null);
    }
  }

  const summary = data?.summary;

  return (
    <LecturerLayout>
      <div className="mx-auto w-full max-w-7xl space-y-7 pb-10">
        {/* Page header */}
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span>Workspace</span>
              <span>/</span>
              <span className="text-blue-600">Examinations</span>
            </div>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Your examinations
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Create, organize and manage your examinations from one place.
              Keep track of student access and examination activity.
            </p>
          </div>

          <Link
            href="/lecturer/create-test"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:-translate-y-0.5 hover:bg-blue-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Create new test
          </Link>
        </section>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">
              !
            </div>

            <p className="flex-1 text-sm leading-6 text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-red-400 transition hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Overview statistics */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Examination overview
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                A summary of your examination workspace
              </p>
            </div>

            {isValidating && !loading && (
              <span className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                Updating
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {loading ? (
              <>
                <OverviewSkeleton />
                <OverviewSkeleton />
                <OverviewSkeleton />
                <OverviewSkeleton />
              </>
            ) : (
              <>
                <OverviewCard
                  label="Total tests"
                  value={summary?.total ?? 0}
                  description="Examinations created"
                  icon="clipboard"
                  color="blue"
                />

                <OverviewCard
                  label="Published"
                  value={summary?.published ?? 0}
                  description="Published examinations"
                  icon="check"
                  color="emerald"
                />

                <OverviewCard
                  label="Drafts"
                  value={summary?.drafts ?? 0}
                  description="Unpublished examinations"
                  icon="edit"
                  color="amber"
                />

                <OverviewCard
                  label="Roster students"
                  value={summary?.students ?? 0}
                  description="Student entries across tests"
                  icon="users"
                  color="violet"
                />
              </>
            )}
          </div>
        </section>

        {/* Test list heading */}
        <section>
          <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                All examinations
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Manage your tests, student access and results.
              </p>
            </div>

            {!loading && (
              <p className="text-xs font-medium text-slate-400">
                {data?.total ?? 0} examination
                {(data?.total ?? 0) === 1 ? "" : "s"} in total
              </p>
            )}
          </div>

          {/* Loading state */}
          {loading && <TestsSkeleton />}

          {/* Empty state */}
          {!loading && tests.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-8 w-8"
                >
                  <path
                    d="M8 4h8M8 2h8a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 11h8M8 15h8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h3 className="mt-5 text-base font-bold text-slate-900">
                No examinations yet
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                You haven't created any examinations. Create your first test
                to start adding questions and managing your students.
              </p>

              <Link
                href="/lecturer/create-test"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <span>+</span>
                Create your first test
              </Link>
            </div>
          )}

          {/* Test cards */}
          {!loading && tests.length > 0 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {tests.map((test) => (
                <TestCard
                  key={test.id}
                  test={test}
                  newCode={newCode?.testId === test.id ? newCode.code : null}
                  generating={generatingId === test.id}
                  deleting={deletingId === test.id}
                  copied={copiedId === test.id}
                  onRegenerate={() => handleRegenerate(test.id)}
                  onCopy={() => handleCopy(test.id, test.linkToken)}
                  onDelete={() =>
                    setDeleteTarget({
                      id: test.id,
                      title: test.title,
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Pagination */}
        {!loading && (
          <div className="border-t border-slate-200 pt-5">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={data?.total ?? 0}
              pageSize={PAGE_SIZE}
              disabled={isValidating}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingId) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-test-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6"
                >
                  <path
                    d="M12 8v5m0 4h.01M10.3 3.9l-7.8 14A2 2 0 0 0 4.2 21h15.6a2 2 0 0 0 1.7-3.1l-7.8-14a2 2 0 0 0-3.4 0Z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <h2
                  id="delete-test-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Delete examination?
                </h2>

                <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-slate-800">
                    &quot;{deleteTarget.title}&quot;
                  </span>
                  ?
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm leading-6 text-red-700">
                This permanently deletes the examination, its questions,
                student attempts and results. This action cannot be undone.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget.id}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deletingId === deleteTarget.id}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === deleteTarget.id && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {deletingId === deleteTarget.id
                  ? "Deleting..."
                  : "Delete examination"}
              </button>
            </div>
          </div>
        </div>
      )}
    </LecturerLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Test card                                                                  */
/* -------------------------------------------------------------------------- */
function TestCard({
  test,
  newCode,
  generating,
  deleting,
  copied,
  onRegenerate,
  onCopy,
  onDelete,
}: {
  test: TestRow;
  newCode: string | null;
  generating: boolean;
  deleting: boolean;
  copied: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const isScheduled = test.windowState === "scheduled";
  const isOpen = test.windowState === "open";
  const canManageAccess = isScheduled || isOpen;

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-slate-900/5">
      <div className="p-5 sm:p-6">
        {/* Card heading */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={test.status} />
              <WindowBadge status={test.windowState} />
            </div>

            <h3 className="break-words text-base font-bold leading-6 text-slate-900 transition group-hover:text-blue-700">
              {test.title}
            </h3>

            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5"
                >
                  <path
                    d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 3.2a4 4 0 0 1 0 7.6M17 14h1.5a3.5 3.5 0 0 1 3.5 3.5V20"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                {test.rosterCount} student
                {test.rosterCount === 1 ? "" : "s"}
              </span>

              <span className="text-slate-300">•</span>

              <span>
                Created {formatDate(test.createdAt)}
              </span>
            </p>
          </div>

          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 sm:flex">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
            >
              <path
                d="M8 4h8M8 2h8a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a2 2 0 0 1 2-2Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M8 11h8M8 15h8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Schedule information */}
        {isScheduled && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 7v5l3 2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-sky-800">
                Scheduled to open
              </p>
              <p className="mt-1 text-xs leading-5 text-sky-700">
                {formatDateTime(test.loginWindowStart)}
              </p>
            </div>
          </div>
        )}

        {isOpen && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
              >
                <path
                  d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
              </svg>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-800">
                Student access is open
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-700">
                Closes {formatDateTime(test.loginWindowEnd)}
              </p>
            </div>
          </div>
        )}

        {/* Newly generated access code */}
        {newCode && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4"
              >
                <path
                  d="M12 8v4m0 4h.01M10.3 3.9l-7.8 14A2 2 0 0 0 4.2 21h15.6a2 2 0 0 0 1.7-3.1l-7.8-14a2 2 0 0 0-3.4 0Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              New access code generated
            </div>

            <p className="mt-3 break-all font-mono text-2xl font-bold tracking-[0.2em] text-amber-950">
              {newCode}
            </p>

            <p className="mt-2 text-xs leading-5 text-amber-800">
              This code is shown only once. Save it securely and share it
              with your students. The previous code is no longer valid.
            </p>
          </div>
        )}

        {/* Student link */}
        {canManageAccess && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Student login link
            </p>

            <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-600">
              {studentLoginUrl(test.linkToken)}
            </p>

            <button
              type="button"
              onClick={onCopy}
              className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
            >
              {copied ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                  >
                    <path
                      d="m5 12 4.5 4.5L19 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Link copied
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4"
                  >
                    <rect
                      x="8"
                      y="8"
                      width="12"
                      height="12"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                  </svg>
                  Copy student link
                </>
              )}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <Link
            href={`/lecturer/results/${test.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            View results
            <span aria-hidden="true">→</span>
          </Link>

          {test.windowState === "draft" && (
            <Link
              href={`/lecturer/create-test?testId=${test.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-3.5 w-3.5"
              >
                <path
                  d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Continue editing
            </Link>
          )}

          {canManageAccess && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5"
                >
                  <path
                    d="M20 7v5h-5M4 17v-5h5M5.6 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.4-3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {generating ? "Generating..." : "New access code"}
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview cards                                                             */
/* -------------------------------------------------------------------------- */
function OverviewCard({
  label,
  value,
  description,
  icon,
  color,
}: {
  label: string;
  value: number;
  description: string;
  icon: "clipboard" | "check" | "edit" | "users";
  color: "blue" | "emerald" | "amber" | "violet";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 sm:text-sm">
          {label}
        </p>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}
        >
          {icon === "clipboard" && (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 12h6M9 16h6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {icon === "check" && (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="m5 12 4.5 4.5L19 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {icon === "edit" && (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="m14 5 5 5M4 20l4.5-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {icon === "users" && (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 3.2a4 4 0 0 1 0 7.6M17 14h1.5a3.5 3.5 0 0 1 3.5 3.5V20"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
        {value.toLocaleString()}
      </p>

      <p className="mt-1 text-[11px] leading-5 text-slate-400 sm:text-xs">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status badges                                                              */
/* -------------------------------------------------------------------------- */
function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const styles: Record<string, string> = {
    published: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    draft: "bg-amber-50 text-amber-700 ring-amber-600/10",
    closed: "bg-slate-100 text-slate-600 ring-slate-500/10",
  };

  const labels: Record<string, string> = {
    published: "Published",
    draft: "Draft",
    closed: "Closed",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
        styles[normalized] ??
        "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labels[normalized] ?? normalized}
    </span>
  );
}

function WindowBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-amber-50 text-amber-700",
    scheduled: "bg-sky-50 text-sky-700",
    open: "bg-emerald-50 text-emerald-700",
    closed: "bg-slate-100 text-slate-600",
  };

  const labels: Record<string, string> = {
    draft: "Not scheduled",
    scheduled: "Scheduled",
    open: "Accepting students",
    closed: "Window closed",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        styles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading skeletons                                                          */
/* -------------------------------------------------------------------------- */
function OverviewSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="mt-5 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-32" />
    </div>
  );
}

function TestsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 xl:grid-cols-2"
      aria-busy="true"
      aria-label="Loading examinations"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-10 w-10 rounded-xl" />
          </div>

          <Skeleton className="mt-6 h-16 w-full rounded-xl" />

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Date formatting                                                            */
/* -------------------------------------------------------------------------- */
function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
