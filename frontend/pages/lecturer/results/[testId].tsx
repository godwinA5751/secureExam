import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import LecturerLayout from "../../../components/LecturerLayout";
import { api, tokenStore } from "../../../lib/api";

type ResultRow = {
  idNumber: string;
  status: "submitted" | "auto-submitted";
  score: number | null;
  submittedAt: string | null;
};

export default function TestResults() {
  const router = useRouter();
  const { testId } = router.query;

  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "submitted" | "auto-submitted">(
    "all"
  );

  useEffect(() => {
    if (!router.isReady || typeof testId !== "string") return;

    const token = tokenStore.get("lecturerToken");

    if (!token) {
      router.push("/lecturer/login");
      return;
    }

    setLoading(true);
    setError(null);

    api
      .liveResults(token, testId)
      .then((response) => {
        setResults(response.results);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router.isReady, router, testId]);

  const filteredResults = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return results.filter((result) => {
      const matchesSearch =
        !normalizedSearch ||
        result.idNumber.toLowerCase().includes(normalizedSearch);

      const matchesFilter =
        filter === "all" || result.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [results, search, filter]);

  const submittedCount = results.filter(
    (result) => result.status === "submitted"
  ).length;

  const autoSubmittedCount = results.filter(
    (result) => result.status === "auto-submitted"
  ).length;

  const scores = results
    .map((result) => result.score)
    .filter((score): score is number => score !== null);

  const averageScore =
    scores.length > 0
      ? scores.reduce((total, score) => total + score, 0) / scores.length
      : null;

  async function handleExport() {
    const token = tokenStore.get("lecturerToken");

    if (!token || typeof testId !== "string") {
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000"}/api/tests/${testId}/export`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to export results");
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "exam-results.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <LecturerLayout>
      <div className="mb-6">
        <Link
          href="/lecturer/tests"
          className="text-sm text-violet-600 hover:text-violet-700"
        >
          ← Back to tests
        </Link>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Test results
            </h1>

            <p className="text-sm text-slate-500 mt-1">
              View submitted attempts and scores.
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={loading || results.length === 0}
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
        <StatCard
          label="Submitted"
          value={submittedCount}
        />

        <StatCard
          label="Auto-submitted"
          value={autoSubmittedCount}
        />

        <StatCard
          label="Average score"
          value={averageScore !== null ? averageScore.toFixed(2) : "—"}
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search student ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />

          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value as
                  | "all"
                  | "submitted"
                  | "auto-submitted"
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500"
          >
            <option value="all">All results</option>
            <option value="submitted">Submitted</option>
            <option value="auto-submitted">Auto-submitted</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-500">
            Loading results...
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No submitted results yet.
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Results will appear here when students submit their attempts.
          </p>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-500">
            No results match your search.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">
                    Student ID
                  </th>

                  <th className="text-left px-5 py-3 font-medium text-slate-600">
                    Status
                  </th>

                  <th className="text-left px-5 py-3 font-medium text-slate-600">
                    Score
                  </th>

                  <th className="text-left px-5 py-3 font-medium text-slate-600">
                    Submitted
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredResults.map((result, index) => (
                  <tr
                    key={`${result.idNumber}-${result.submittedAt}-${index}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {result.idNumber || "Unknown"}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={result.status} />
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {result.score !== null ? result.score : "—"}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {result.submittedAt
                        ? new Date(
                            result.submittedAt
                          ).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-5 py-3">
            <p className="text-xs text-slate-400">
              Showing {filteredResults.length} of {results.length} result
              {results.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
      )}
    </LecturerLayout>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <p className="text-xs text-slate-500">{label}</p>

      <p className="text-2xl font-semibold text-slate-900 mt-1">
        {value}
      </p>
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
      className={`text-xs rounded-full px-2 py-0.5 ${
        isAutoSubmitted
          ? "bg-amber-100 text-amber-700"
          : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isAutoSubmitted ? "Auto-submitted" : "Submitted"}
    </span>
  );
}