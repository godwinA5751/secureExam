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
              <button
                onClick={() => handleRegenerate(t.id)}
                disabled={generatingId === t.id}
                className="text-xs font-medium text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50"
              >
                {generatingId === t.id ? "Generating..." : "Generate new access code"}
              </button>
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

            {t.status === "published" && (
              <p className="mt-2 text-xs text-slate-400 break-all font-mono">{studentLoginUrl(t.linkToken)}</p>
            )}
          </div>
        ))}
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