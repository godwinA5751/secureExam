
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import LecturerLayout from "../../../components/LecturerLayout";
import Pagination from "../../../components/Pagination";
import { Skeleton } from "../../../components/Skeleton";
import { api } from "../../../lib/api";
import { useResults, useDebounced } from "../../../lib/hooks";

type StatusFilter = "all" | "submitted" | "auto-submitted";

const PAGE_SIZES = [10, 25, 50, 100];

export default function TestResults() {
  const router = useRouter();
  const { testId } = router.query;

  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebounced(search.trim(), 300);

  const { data, isLoading: loading } = useResults(
    typeof testId === "string" ? testId : undefined,
    { page, pageSize, q: debouncedSearch, status: filter },
    true
  );

  const results = data?.results ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;

  const submitted = summary?.submitted ?? 0;
  const autoSubmitted = summary?.autoSubmitted ?? 0;
  const totalFinished = submitted + autoSubmitted;

  const averageText =
    summary?.averageScore != null
      ? `${summary.averageScore.toFixed(1)}${
          summary.totalPossible ? `/${summary.totalPossible}` : ""
        }`
      : "—";

  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (data && page > Math.max(1, data.totalPages)) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [data, page]);

  async function handleExport() {
    if (typeof testId !== "string") return;

    try {
      await api.exportResults(testId);
    } catch (err: any) {
      setError(err.message || "Unable to export results.");
    }
  }

  return (
    <LecturerLayout>
      <div className="mx-auto max-w-7xl space-y-7">
        {/* Page header */}
        <div>
          <Link
            href="/lecturer/tests"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-600"
          >
            <span>←</span>
            Back to tests
          </Link>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  Assessment results
                </span>

                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Live updates
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Test results
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Monitor student submissions, review performance, and export
                assessment results.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={loading || totalFinished === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path
                  d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
              !
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">
                Something went wrong
              </p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {/* Statistics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            label="Submitted"
            value={submitted}
            loading={loading}
            description="Completed by students"
            icon="check"
            color="blue"
          />

          <StatCard
            label="Auto-submitted"
            value={autoSubmitted}
            loading={loading}
            description="Automatically submitted attempts"
            icon="clock"
            color="amber"
          />

          <StatCard
            label="Average score"
            value={averageText}
            loading={loading}
            description="Across completed attempts"
            icon="chart"
            color="violet"
          />
        </div>

        {/* Results section */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Student submissions
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Search and review individual student attempts.
                </p>
              </div>

              {!loading && (
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {total} {total === 1 ? "result" : "results"}
                </span>
              )}
            </div>

            {/* Filters */}
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_190px_150px]">
              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16 16 4 4" strokeLinecap="round" />
                </svg>

                <input
                  type="text"
                  placeholder="Search name or student ID..."
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
                />
              </div>

              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as StatusFilter);
                  setPage(1);
                }}
                disabled={loading}
                aria-label="Filter by submission status"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
              >
                <option value="all">All results</option>
                <option value="submitted">Submitted</option>
                <option value="auto-submitted">Auto-submitted</option>
              </select>

              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                disabled={loading}
                aria-label="Results per page"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Empty states */}
          {!loading && totalFinished === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-8 w-8"
                >
                  <path
                    d="M8 3h7l5 5v13H4V3h4Z"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 3v6h6M8 14h8M8 18h5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h3 className="mt-5 text-base font-semibold text-slate-900">
                No submitted results yet
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Student submissions will appear here once students complete
                their assessment.
              </p>

              <Link
                href="/lecturer/tests"
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Return to tests
                <span>→</span>
              </Link>
            </div>
          ) : !loading && total === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className="h-7 w-7"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16 16 4 4" strokeLinecap="round" />
                </svg>
              </div>

              <h3 className="mt-4 text-sm font-semibold text-slate-800">
                No matching results
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Try changing your search or filter.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setPage(1);
                }}
                className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {/* Results table */}
              <div className="overflow-x-auto" aria-busy={loading}>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Student ID
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Student name
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Submission status
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Score
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Submitted at
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {loading
                      ? Array.from({ length: 6 }).map((_, index) => (
                          <tr key={index}>
                            <td className="px-6 py-5">
                              <Skeleton className="h-4 w-28" />
                            </td>
                            <td className="px-6 py-5">
                              <Skeleton className="h-4 w-32" />
                            </td>
                            <td className="px-6 py-5">
                              <Skeleton className="h-6 w-28 rounded-full" />
                            </td>
                            <td className="px-6 py-5">
                              <Skeleton className="h-4 w-16" />
                            </td>
                            <td className="px-6 py-5">
                              <Skeleton className="h-4 w-36" />
                            </td>
                          </tr>
                        ))
                      : results.map((result, index) => (
                          <tr
                            key={`${result.idNumber}-${result.submittedAt}-${index}`}
                            className="transition hover:bg-blue-50/30"
                          >
                            <td className="whitespace-nowrap px-6 py-5">
                              <span className="font-semibold text-slate-800">
                                {result.idNumber || "Unknown"}
                              </span>
                            </td>

                            <td className="px-6 py-5">
                              <span className="font-medium text-slate-700">
                                {result.name || "—"}
                              </span>
                            </td>

                            <td className="px-6 py-5">
                              <StatusBadge status={result.status} />
                            </td>

                            <td className="whitespace-nowrap px-6 py-5">
                              <span className="font-bold text-slate-800">
                                {result.score !== null
                                  ? result.total
                                    ? `${result.score}/${result.total}`
                                    : result.score
                                  : "—"}
                              </span>
                            </td>

                            <td className="whitespace-nowrap px-6 py-5 text-slate-500">
                              {result.submittedAt
                                ? new Date(result.submittedAt).toLocaleString()
                                : "—"}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="border-t border-slate-100 px-5 py-4 sm:px-6">
                {loading ? (
                  <Skeleton className="h-4 w-40" />
                ) : (
                  <Pagination
                    page={page}
                    totalPages={Math.max(1, data?.totalPages ?? 1)}
                    total={total}
                    pageSize={pageSize}
                    onPageChange={setPage}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </LecturerLayout>
  );
}

function StatCard({
  label,
  value,
  loading,
  description,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  description: string;
  icon: "check" | "clock" | "chart";
  color: "blue" | "amber" | "violet";
}) {
  const colors = {
    blue: {
      icon: "bg-blue-50 text-blue-600",
      accent: "bg-blue-500",
    },
    amber: {
      icon: "bg-amber-50 text-amber-600",
      accent: "bg-amber-500",
    },
    violet: {
      icon: "bg-violet-50 text-violet-600",
      accent: "bg-violet-500",
    },
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>

          {loading ? (
            <Skeleton className="mt-3 h-9 w-24" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </p>
          )}

          <p className="mt-2 text-xs text-slate-400">{description}</p>
        </div>

        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors[color].icon}`}
        >
          {icon === "check" && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path
                d="m5 12 4 4L19 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {icon === "clock" && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="9" />
              <path
                d="M12 7v5l3 2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {icon === "chart" && (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path
                d="M4 19V5m0 14h16M8 15v-3m4 3V7m4 8v-5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 h-1 w-full ${colors[color].accent}`}
      />
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "submitted" | "auto-submitted";
}) {
  const isAutoSubmitted = status === "auto-submitted";

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
        isAutoSubmitted
          ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isAutoSubmitted ? "bg-amber-500" : "bg-emerald-500"
        }`}
      />
      {isAutoSubmitted ? "Auto-submitted" : "Submitted"}
    </span>
  );
}