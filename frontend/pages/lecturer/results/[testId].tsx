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
  const debouncedSearch = useDebounced(search.trim(), 300); // one request per pause, not per keystroke

  const { data, isLoading: loading } = useResults(
    typeof testId === "string" ? testId : undefined,
    { page, pageSize, q: debouncedSearch, status: filter },
    true // live: refresh every 5s
  );
  const results = data?.results ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const totalFinished = (summary?.submitted ?? 0) + (summary?.autoSubmitted ?? 0);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  // Stay on a page that exists.
  useEffect(() => {
    if (data && page > data.totalPages) setPage(data.totalPages);
  }, [data, page]);

  const averageText =
    summary?.averageScore != null
      ? `${summary.averageScore.toFixed(1)}${summary.totalPossible ? `/${summary.totalPossible}` : ""}`
      : "—";

  async function handleExport() {
    if (typeof testId !== "string") return;
    try {
      await api.exportResults(testId);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <LecturerLayout>
      <div className="mb-6">
        <Link href="/lecturer/tests" className="text-sm text-violet-600 hover:text-violet-700">
          ← Back to tests
        </Link>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Test results</h1>
            <p className="text-sm text-slate-500 mt-1">View submitted attempts and scores.</p>
          </div>

          <button
            onClick={handleExport}
            disabled={loading || totalFinished === 0}
            className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Submitted" value={summary?.submitted ?? 0} loading={loading} />
        <StatCard label="Auto-submitted" value={summary?.autoSubmitted ?? 0} loading={loading} />
        <StatCard label="Average score" value={averageText} loading={loading} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search name or student ID..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:bg-slate-50"
          />

          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 disabled:bg-slate-50"
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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 disabled:bg-slate-50"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && totalFinished === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">No submitted results yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Results will appear here when students submit their attempts.
          </p>
        </div>
      ) : !loading && total === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-500">No results match your search.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" aria-busy={loading}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Student ID</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Score</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Submitted</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-5 py-4">
                          <Skeleton className="h-4 w-28" />
                        </td>
                        <td className="px-5 py-4">
                          <Skeleton className="h-4 w-32" />
                        </td>
                        <td className="px-5 py-4">
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </td>
                        <td className="px-5 py-4">
                          <Skeleton className="h-4 w-12" />
                        </td>
                        <td className="px-5 py-4">
                          <Skeleton className="h-4 w-36" />
                        </td>
                      </tr>
                    ))
                  : results.map((result, index) => (
                      <tr key={`${result.idNumber}-${result.submittedAt}-${index}`} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-800">{result.idNumber || "Unknown"}</td>
                        <td className="px-5 py-4 text-slate-700">{result.name || "—"}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={result.status} />
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {result.score !== null
                            ? result.total
                              ? `${result.score}/${result.total}`
                              : result.score
                            : "—"}
                        </td>
                        <td className="px-5 py-4 text-slate-500">
                          {result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-5 py-3">
            {loading ? (
              <Skeleton className="h-3 w-40" />
            ) : (
              <Pagination
                page={page}
                totalPages={data?.totalPages ?? 1}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            )}
          </div>
        </div>
      )}
    </LecturerLayout>
  );
}

function StatCard({ label, value, loading }: { label: string; value: string | number; loading: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs text-slate-500">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-14 mt-1" />
      ) : (
        <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "submitted" | "auto-submitted" }) {
  const isAutoSubmitted = status === "auto-submitted";

  return (
    <span
      className={`text-xs rounded-full px-2 py-0.5 ${
        isAutoSubmitted ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isAutoSubmitted ? "Auto-submitted" : "Submitted"}
    </span>
  );
}