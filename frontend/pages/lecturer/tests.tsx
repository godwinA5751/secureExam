import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import LecturerLayout from "../../components/LecturerLayout";
import { api, tokenStore } from "../../lib/api";

type TestRow = {
  id: string;
  title: string;
  status: string;
  window: "opened" | "closed";
  linkToken: string;
  rosterCount: number;
  createdAt: string;
};

export default function Tests() {
  const router = useRouter();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [newCode, setNewCode] = useState<{ testId: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
  id: string;
  title: string;
} | null>(null);

  useEffect(() => {
    const token = tokenStore.get("lecturerToken");
    if (!token) {
      router.push("/lecturer/login");
      return;
    }
    api
      .listMyTests(token)
      .then((r) => setTests(r.tests))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleRegenerate(testId: string) {
    const token = tokenStore.get("lecturerToken");
    if (!token) return;
    setError(null);
    try {
      setGeneratingId(testId)
      const { accessCode } = await api.regenerateAccessCode(token, testId);
      setNewCode({ testId, code: accessCode });
    } catch (err: any) {
      setError(err.message);
    } finally{
      setGeneratingId(null)
    }
  }

  function studentLoginUrl(linkToken: string): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/student/login?linkToken=${linkToken}`;
  }

  async function handleDelete(testId: string, title: string) {
    const token = tokenStore.get("lecturerToken");

    if (!token || !deleteTarget) {
      router.push("/lecturer/login");
      return;
    }

    setDeletingId(deleteTarget.id);
    setError(null);

    try {
      await api.deleteTest(token, deleteTarget.id);

      setTests((prev) =>
        prev.filter((test) => test.id !== deleteTarget.id)
      );

      setDeleteTarget(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }

  }

  return (
    <LecturerLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tests</h1>
        <Link href="/lecturer/create-test" className="rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium">
          + New test
        </Link>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && tests.length === 0 && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm text-slate-500">No tests yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {tests.map((t) => (
          <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.rosterCount} student(s) on roster · created{" "}
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={t.status} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={`/lecturer/results/${t.id}`}
                className="text-xs font-medium text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50 cursor-pointer"
              >
                View results
              </Link>

              <button
                type="button"
                onClick={() =>
                  setDeleteTarget({
                    id: t.id,
                    title: t.title,
                  })
                }
                disabled={deletingId === t.id}
                className="text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>

              {t.window === "opened" && (
                <button
                  onClick={() => handleRegenerate(t.id)}
                  disabled={generatingId === t.id}
                  className="text-xs font-medium text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                >
                  {generatingId === t.id ? "Generating..." : "Generate new access code"}
                </button>
              )}
              {t.window === "opened" && (
                <button
                  onClick={() => navigator.clipboard.writeText(studentLoginUrl(t.linkToken))}
                  className="text-xs font-medium text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50"
                >
                  Copy student link
                </button>
              )}
              <StatusBadge status={t.window} />
            </div>

            {newCode?.testId === t.id && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <p className="font-mono text-lg tracking-widest">{newCode.code}</p>
                <p className="mt-1 text-xs">Shown once - the old code no longer works.</p>
              </div>
            )}

            {t.window === "opened" && (
              <p className="mt-2 text-xs text-slate-400 break-all font-mono">{studentLoginUrl(t.linkToken)}</p>
            )}
          </div>
        ))}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v4m0 4h.01M10.29 3.86l-7.82 14A2 2 0 004.2 21h15.6a2 2 0 001.73-3.14l-7.82-14a2 2 0 00-3.42 0z"
                    />
                  </svg>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Delete test?
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Are you sure you want to delete{" "}
                    <span className="font-medium text-gray-900">
                      "{deleteTarget.title}"
                    </span>
                    ?
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-red-50 p-3">
                <p className="text-sm text-red-700">
                  This will permanently delete the test, its questions, and all
                  student attempts and results. This action cannot be undone.
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deletingId === deleteTarget.id}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(deleteTarget.id, deleteTarget.title)}
                  disabled={deletingId === deleteTarget.id}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingId === deleteTarget.id ? "Deleting..." : "Delete test"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LecturerLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-700",
    draft: "bg-amber-100 text-amber-700",
    closed: "bg-slate-100 text-slate-600",
    opened: "bg-emerald-100 text-emerald-700"
  };
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}