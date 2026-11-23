
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { api } from "../../lib/api";
import { clearCache } from "../../lib/hooks";

function BrandMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path
          d="M12 3.5 20 6.7v5.1c0 4.2-3.1 7.3-8 9.2-4.9-1.9-8-5-8-9.2V6.7l8-3.2Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="m8.5 12 2.2 2.2 4.8-4.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function LecturerLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.lecturerLogin(email, password);
      await clearCache();
      await router.push("/lecturer/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* Branding panel */}
      <section className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#08142B] p-12 text-white lg:flex xl:p-16">
        <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-blue-600/20 blur-[110px]" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />

        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:52px_52px]" />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <BrandMark />
            <span className="text-2xl font-bold tracking-tight">
              Secure<span className="text-blue-400">Exam</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs font-semibold text-blue-200">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            Lecturer workspace
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Your examinations.
            <br />
            <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
              Under your control.
            </span>
          </h1>

          <p className="mt-6 max-w-md text-base leading-8 text-slate-300">
            Create and manage online examinations, organize your students and
            review performance from one secure workspace.
          </p>

          <div className="mt-10 space-y-5">
            {[
              "Create and manage examinations",
              "Organize student access and rosters",
              "Review submissions and results",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-sm text-emerald-400">
                  ✓
                </span>
                <span className="text-sm text-slate-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="text-xs text-slate-400">
            SecureExam · Smarter online examinations
          </p>
        </div>
      </section>

      {/* Login area */}
      <section className="flex min-h-screen flex-col">
        {/* Mobile brand header */}
        <div className="border-b border-slate-100 px-6 py-5 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-3">
            <BrandMark />
            <span className="text-xl font-bold tracking-tight text-slate-950">
              Secure<span className="text-blue-600">Exam</span>
            </span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-9">
              <p className="text-sm font-semibold text-blue-600">
                LECTURER ACCOUNT
              </p>

              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back
              </h2>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Sign in to continue managing your examinations.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
              >
                <span className="mt-0.5 text-red-600">!</span>
                <p className="text-sm leading-6 text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>
                </div>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-400 transition hover:text-slate-700"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                        <path
                          d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3.2 4.1M6.2 6.2C4.1 7.6 3 12 3 12s3.5 7 9 7c1.2 0 2.3-.3 3.3-.8"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                        <path
                          d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
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
                        className="opacity-25"
                      />
                      <path
                        d="M21 12a9 9 0 0 0-9-9"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in to your account
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                      <path
                        d="M4 10h12m-5-5 5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="my-8 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-xs text-slate-400">NEW TO SECUREEXAM?</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <p className="text-center text-sm text-slate-500">
              Don&apos;t have a lecturer account?{" "}
              <Link
                href="/lecturer/register"
                className="font-semibold text-blue-600 transition hover:text-blue-700"
              >
                Create an account
              </Link>
            </p>

            <div className="mt-12 text-center">
              <Link
                href="/"
                className="text-xs font-medium text-slate-400 transition hover:text-blue-600"
              >
                ← Back to SecureExam home
              </Link>
            </div>
          </div>
        </div>

        <footer className="px-6 py-5 text-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} SecureExam. All rights reserved.
          </p>
        </footer>
      </section>
    </main>
  );
}
