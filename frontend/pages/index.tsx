import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">SecureExam</h1>
        <p className="text-sm text-slate-500 mb-6">Lecturer-managed online testing platform</p>
        <Link href="/lecturer/login" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">
          Lecturer sign in
        </Link>
      </div>
    </div>
  );
}
