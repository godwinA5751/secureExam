
import { useRouter } from "next/router";
import LecturerLayout from "../../components/LecturerLayout";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api";
import { useMe, clearCache } from "../../lib/hooks";

export default function Profile() {
  const router = useRouter();
  const { data, error: loadError, isLoading: loading } = useMe();

  const name = data?.name ?? "";
  const email = data?.email ?? "";
  const createdAt = data?.createdAt ?? "";

  async function handleLogout() {
    try {
      await api.logout();
      clearCache();
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      router.push("/lecturer/login");
    }
  }

  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const memberDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <LecturerLayout>
      <div className="mx-auto max-w-5xl space-y-7">
        {/* Header */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Account settings
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            My profile
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            View your account information and manage your SecureExam session.
          </p>
        </div>

        {/* Error */}
        {loadError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-sm font-bold text-red-600">
              !
            </div>
            <div>
              <p className="text-sm font-semibold text-red-800">
                Unable to load profile
              </p>
              <p className="mt-1 text-sm text-red-700">
                {String(loadError)}
              </p>
            </div>
          </div>
        )}

        <div
          className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]"
          aria-busy={loading}
        >
          {/* Profile information */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <h2 className="text-base font-bold text-slate-900">
                Personal information
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your lecturer account details.
              </p>
            </div>

            <div className="p-5 sm:p-7">
              {/* Profile identity */}
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-7 sm:flex-row sm:items-center">
                {loading ? (
                  <>
                    <Skeleton className="h-20 w-20 shrink-0 rounded-2xl" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-52" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-2xl font-bold text-white shadow-lg shadow-blue-100">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <h3 className="break-words text-xl font-bold text-slate-900">
                        {name || "Lecturer"}
                      </h3>
                      <p className="mt-1 break-all text-sm text-slate-500">
                        {email || "No email available"}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Lecturer account
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Account details */}
              <div className="pt-6">
                <h3 className="mb-4 text-sm font-semibold text-slate-800">
                  Account details
                </h3>

                <dl className="space-y-5">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-slate-500">Full name</dt>
                    <dd className="text-sm font-semibold text-slate-800 sm:text-right">
                      {loading ? (
                        <Skeleton className="h-4 w-32" />
                      ) : (
                        name || "—"
                      )}
                    </dd>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-slate-500">Email address</dt>
                    <dd className="break-all text-sm font-semibold text-slate-800 sm:max-w-[65%] sm:text-right">
                      {loading ? (
                        <Skeleton className="h-4 w-44" />
                      ) : (
                        email || "—"
                      )}
                    </dd>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-slate-500">Account role</dt>
                    <dd className="text-sm font-semibold text-slate-800 sm:text-right">
                      Lecturer
                    </dd>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-slate-500">Member since</dt>
                    <dd className="text-sm font-semibold text-slate-800 sm:text-right">
                      {loading ? (
                        <Skeleton className="h-4 w-28" />
                      ) : (
                        memberDate
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          {/* Account overview and security */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path
                      d="M12 3 4.5 6v5c0 5 3.2 8.2 7.5 10 4.3-1.8 7.5-5 7.5-10V6L12 3Z"
                      strokeLinejoin="round"
                    />
                    <path
                      d="m9 12 2 2 4-4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Account security
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Your account access
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-sm font-semibold text-slate-800">
                    Protected session
                  </p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Your lecturer account uses secure authentication to protect
                  access to your tests and student results.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path
                      d="M10 17 15 12 10 7M15 12H3m9-8h6a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Sign out
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    End your current session
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-500">
                Sign out of your lecturer account when you are finished using
                SecureExam, especially on a shared device.
              </p>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                >
                  <path
                    d="M10 17 15 12 10 7M15 12H3m9-8h6a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Log out of SecureExam
              </button>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-1 border-t border-slate-200 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>SecureExam · Lecturer workspace</p>
          <p>Manage your assessments with confidence.</p>
        </div>
      </div>
    </LecturerLayout>
  );
}
