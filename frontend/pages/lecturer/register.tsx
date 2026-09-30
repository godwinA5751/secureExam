import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { api, tokenStore } from "../../lib/api";

export default function LecturerRegister() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    setLoading(true);
    try {
      const { token } = await api.lecturerRegister(name, email, password);
      tokenStore.set("lecturerToken", token);
      router.push("/lecturer/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-semibold text-slate-800 mb-1">SecureExam</h1>
        <p className="text-sm text-slate-500 mb-6">Create a lecturer account</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <label className="block text-sm text-slate-600 mb-1">Full name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="block text-sm text-slate-600 mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="block text-sm text-slate-600 mb-1">Password</label>
        <input
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-slate-400 mb-6">At least 10 characters.</p>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <p className="mt-4 text-xs text-slate-500 text-center">
          Already have an account?{" "}
          <Link href="/lecturer/login" className="text-slate-800 underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}