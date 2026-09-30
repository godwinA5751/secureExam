import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import LecturerLayout from "../../components/LecturerLayout";
import { api, tokenStore } from "../../lib/api";

type TestRow = {
  id: string;
  title: string;
  status: string;
  linkToken: string;
  rosterCount: number;
  createdAt: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [tests, setTests] = useState<TestRow[]>([]);
  const [name, setName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = tokenStore.get("lecturerToken");
    if (!token) {
      router.push("/lecturer/login");
      return;
    }
    Promise.all([api.listMyTests(token), api.getMe(token)])
      .then(([testsRes, meRes]) => {
        setTests(testsRes.tests);
        setName(meRes.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const published = tests.filter((t) => t.status === "published").length;
  const drafts = tests.filter((t) => t.status === "draft").length;
  const totalStudents = tests.reduce((sum, t) => sum + t.rosterCount, 0);
  const recent = tests.slice(0, 5);

  return (
    <LecturerLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {name ? `Welcome back, ${name.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">Here's what's happening across your tests.</p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard label="Total tests" value={tests.length} accent="bg-violet-500" />
            <StatCard label="Published" value={published} accent="bg-emerald-500" />
            <StatCard label="Drafts" value={drafts} accent="bg-amber-500" />
            <StatCard label="Students on rosters" value={totalStudents} accent="bg-sky-500" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-800">Recent tests</h2>
              <Link href="/lecturer/tests" className="text-xs font-medium text-violet-700">
                View all →
              </Link>
            </div>

            {recent.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-slate-500 mb-3">You haven&apos;t created a test yet.</p>
                <Link
                  href="/lecturer/create-test"
                  className="inline-block rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium"
                >
                  Create your first test
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((t) => (
                  <li key={t.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-500">{t.rosterCount} student(s) on roster</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </LecturerLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className={`h-1.5 w-8 rounded-full ${accent} mb-3`} />
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-emerald-100 text-emerald-700",
    draft: "bg-amber-100 text-amber-700",
    closed: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${styles[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}