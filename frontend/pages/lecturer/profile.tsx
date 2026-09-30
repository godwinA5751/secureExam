import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import LecturerLayout from "../../components/LecturerLayout";
import { api, tokenStore } from "../../lib/api";

export default function Profile() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = tokenStore.get("lecturerToken");
    if (!token) {
      router.push("/lecturer/login");
      return;
    }
    api
      .getMe(token)
      .then((r) => {
        setName(r.name);
        setEmail(r.email);
        setCreatedAt(r.createdAt);
      })
      .catch((err) => setError(err.message));
  }, [router]);

  function handleLogout() {
    tokenStore.clear("lecturerToken");
    router.push("/lecturer/login");
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <LecturerLayout>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Profile</h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-full bg-violet-600 text-white flex items-center justify-center text-lg font-semibold">
            {initials || "?"}
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">{email}</p>
          </div>
        </div>

        <dl className="text-sm divide-y divide-slate-100">
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-800 font-medium">Lecturer</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Member since</dt>
            <dd className="text-slate-800 font-medium">
              {createdAt ? new Date(createdAt).toLocaleDateString() : "-"}
            </dd>
          </div>
        </dl>

        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-lg border border-red-200 text-red-600 py-2 text-sm font-medium hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    </LecturerLayout>
  );
}