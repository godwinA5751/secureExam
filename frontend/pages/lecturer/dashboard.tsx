import { useTests, useMe } from "../../lib/hooks";
import Link from "next/link";
import LecturerLayout from "../../components/LecturerLayout";
import { Skeleton, StatCardSkeleton } from "../../components/Skeleton";

export default function Dashboard() {
  const {
    data: testsData,
    error: testsError,
    isLoading: testsLoading,
  } = useTests(1, 5);

  const {
    data: me,
    error: meError,
    isLoading: meLoading,
  } = useMe();

  const tests = testsData?.tests ?? [];
  const summary = testsData?.summary;
  const name = me?.name ?? "";
  const loading = testsLoading || meLoading;
  const error = (testsError ?? meError)?.message ?? null;

  const published = summary?.published ?? 0;
  const drafts = summary?.drafts ?? 0;
  const totalStudents = summary?.students ?? 0;
  const totalTests = summary?.total ?? 0;

  const firstName = name ? name.split(" ")[0] : "there";

  return (
    <LecturerLayout>
      <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
        {/* Welcome section */}
        <section className="relative overflow-hidden rounded-2xl bg-[#08142B] px-6 py-8 text-white shadow-lg shadow-slate-900/10 sm:px-8 sm:py-10">
          <div className="absolute -right-16 -top-28 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute -bottom-32 right-1/3 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-7 sm:flex-row sm:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 text-xs font-medium text-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Lecturer workspace
              </div>

              {loading ? (
                <Skeleton className="h-9 w-64 bg-white/10" />
              ) : (
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Welcome back, {firstName}
                </h1>
              )}

              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
                Manage your examinations, organize your students and keep
                track of your testing activities from one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/lecturer/create-test"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition hover:-translate-y-0.5 hover:bg-blue-500"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path
                    d="M10 4v12M4 10h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Create a test
              </Link>

              <Link
                href="/lecturer/tests"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                View tests
              </Link>
            </div>
          </div>
        </section>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-600">
              !
            </span>
            <p className="text-sm leading-6 text-red-700">{error}</p>
          </div>
        )}

        {/* Statistics */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Overview
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                A snapshot of your examination workspace
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard
                label="Total tests"
                value={totalTests}
                description="All examinations created"
                icon="clipboard"
                color="blue"
              />

              <StatCard
                label="Published tests"
                value={published}
                description="Available examinations"
                icon="check"
                color="emerald"
              />

              <StatCard
                label="Draft tests"
                value={drafts}
                description="Unpublished examinations"
                icon="edit"
                color="amber"
              />

              <StatCard
                label="Roster students"
                value={totalStudents}
                description="Students across your tests"
                icon="users"
                color="violet"
              />
            </div>
          )}
        </section>

        {/* Recent tests */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Recent tests
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Your five latest examinations
              </p>
            </div>

            <Link
              href="/lecturer/tests"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
            >
              View all tests
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          {loading ? (
            <div className="divide-y divide-slate-100 px-5 sm:px-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-5"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : tests.length === 0 ? (
            <div className="px-5 py-14 text-center sm:px-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
                  <path
                    d="M7 3.5h7l5 5v11A1.5 1.5 0 0 1 17.5 21h-10A1.5 1.5 0 0 1 6 19.5v-14A2 2 0 0 1 8 3.5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 3.5v5h5M9 13h6M9 16.5h6"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <h3 className="mt-4 text-sm font-bold text-slate-900">
                No examinations yet
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Create your first examination to start managing students
                and collecting results.
              </p>

              <Link
                href="/lecturer/create-test"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <span aria-hidden="true">+</span>
                Create your first test
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-4">Test name</th>
                      <th className="px-6 py-4">Students</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {tests.map((test) => (
                      <tr
                        key={test.id}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-4">
                          <p className="max-w-md truncate text-sm font-semibold text-slate-800">
                            {test.title}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">
                            {test.rosterCount}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge status={test.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {tests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {test.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {test.rosterCount} student(s) on roster
                      </p>
                    </div>

                    <StatusBadge status={test.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="mb-4 text-base font-bold text-slate-900">
            Quick actions
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <QuickAction
              href="/lecturer/create-test"
              title="Create a new test"
              description="Set up a new examination for your students."
              icon="plus"
            />

            <QuickAction
              href="/lecturer/tests"
              title="Manage examinations"
              description="View and manage your existing tests."
              icon="clipboard"
            />
          </div>
        </section>
      </div>
    </LecturerLayout>
  );
}

function StatCard({
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

        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors[color]}`}>
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
                strokeLinejoin="round"
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const styles: Record<string, string> = {
    published: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    draft: "bg-amber-50 text-amber-700 ring-amber-600/10",
    closed: "bg-slate-100 text-slate-600 ring-slate-500/10",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${
        styles[normalized] ?? "bg-slate-100 text-slate-600 ring-slate-500/10"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {normalized}
    </span>
  );
}

function QuickAction({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: "plus" | "clipboard";
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
        {icon === "plus" ? (
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
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
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-900 transition group-hover:text-blue-600">
          {title}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <span className="text-lg text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600">
        →
      </span>
    </Link>
  );
}
