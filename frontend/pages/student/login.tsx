import { useState } from "react";
import { useRouter } from "next/router";
import { api, tokenStore } from "../../lib/api";

export default function StudentLogin() {
  const router = useRouter();
  const { linkToken } = router.query as { linkToken?: string };
  const [idNumber, setIdNumber] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!linkToken) return;
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.studentLogin(linkToken, idNumber, accessCode);
      tokenStore.set("studentToken", token);
      router.push({ pathname: "/student/test", query: { linkToken } });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-lg font-semibold text-slate-800 mb-1">SecureExam</h1>
        <p className="text-sm text-slate-500 mb-6">Enter your ID and access code to begin</p>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <label className="block text-sm text-slate-600 mb-1">ID number</label>
        <input
          required
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          className="w-full mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="block text-sm text-slate-600 mb-1">Access code</label>
        <input
          required
          maxLength={6}
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          className="w-full mb-6 rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest font-mono"
        />

        <button
          type="submit"
          disabled={loading || !linkToken}
          className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Checking..." : "Start test"}
        </button>

        <p className="mt-4 text-xs text-slate-400">
          Once you start, leaving this tab will immediately end your attempt.
        </p>
      </form>
    </div>
  );
}
