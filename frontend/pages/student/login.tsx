
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { api } from "../../lib/api";

export default function StudentLogin() {
  const router = useRouter();
  const { linkToken } = router.query as { linkToken?: string };

  const [idNumber, setIdNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!error) return;

    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!linkToken || loading) return;

    setError(null);
    setLoading(true);

    try {
      await api.studentLogin(linkToken, idNumber.trim(), accessCode.trim());

      router.push({
        pathname: "/student/test",
        query: { linkToken },
      });
    } catch (err: any) {
      setError(err.message || "Unable to sign in. Please check your details.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 sm:px-6">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-indigo-100/60 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(#1e293b 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-7 w-7"
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

          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            SecureExam
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Student examination portal
          </p>
        </div>

        {/* Login card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
          <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Examination access
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              Welcome, student
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter your student ID and the access code provided by your
              lecturer to access your examination.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-6 py-7 sm:px-8">
            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-sm font-bold text-red-600">
                  !
                </span>
                <p className="pt-1 text-sm leading-5 text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* Student ID */}
            <div>
              <label
                htmlFor="student-id"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Student ID number
              </label>

              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path
                    d="M5 21v-2a7 7 0 0 1 14 0v2"
                    strokeLinecap="round"
                  />
                </svg>

                <input
                  id="student-id"
                  type="text"
                  autoComplete="username"
                  required
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="Enter your student ID"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Access code */}
            <div>
              <label
                htmlFor="access-code"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Examination access code
              </label>

              <div className="relative">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                >
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path
                    d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"
                    strokeLinecap="round"
                  />
                </svg>

                <input
                  id="access-code"
                  type={showAccessCode ? "text" : "password"}
                  autoComplete="off"
                  required
                  maxLength={6}
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Enter your access code"
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-12 text-sm font-semibold tracking-[0.2em] text-slate-800 outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={() => setShowAccessCode((current) => !current)}
                  disabled={loading}
                  aria-label={
                    showAccessCode ? "Hide access code" : "Show access code"
                  }
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 disabled:opacity-50"
                >
                  {showAccessCode ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <path
                        d="M3 3 21 21M10.6 10.6a2 2 0 0 0 2.8 2.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3 3.8M6.2 6.2C4.1 7.7 3 10 3 12c0 0 3.5 7 9 7 1.3 0 2.5-.4 3.5-1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <path
                        d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-400">
                Use the six-character code supplied by your lecturer.
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !linkToken || !idNumber.trim() || !accessCode.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-100 transition hover:from-blue-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="3"
                      opacity=".25"
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Verifying details...
                </>
              ) : (
                <>
                  Continue to examination
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          {/* Security notice */}
          <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-5 sm:px-8">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
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
                    d="M12 8v4m0 3h.01"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">
                  Examination security notice
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Once your examination begins, leaving the examination tab
                  will be recorded. Repeated focus-loss incidents may
                  automatically submit your attempt.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-7 text-center text-xs text-slate-400">
          Powered by <span className="font-semibold text-slate-600">SecureExam</span>
          {" "}· Secure online assessments
        </p>
      </div>
    </main>
  );
}
