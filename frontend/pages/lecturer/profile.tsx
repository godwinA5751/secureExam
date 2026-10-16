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

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <LecturerLayout>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Profile</h1>

      {loadError && <p className="text-sm text-red-600 mb-4">{loadError}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md" aria-busy={loading}>
        <div className="flex items-center gap-4 mb-6">
          {loading ? (
            <>
              <Skeleton className="h-14 w-14 rounded-full shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-52" />
              </div>
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-full bg-violet-600 text-white flex items-center justify-center text-lg font-semibold">
                {initials || "?"}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{name}</p>
                <p className="text-sm text-slate-500">{email}</p>
              </div>
            </>
          )}
        </div>

        <dl className="text-sm divide-y divide-slate-100">
          <div className="flex justify-between py-2">
            <dt className="text-slate-500">Role</dt>
            <dd className="text-slate-800 font-medium">Lecturer</dd>
          </div>
          <div className="flex justify-between items-center py-2">
            <dt className="text-slate-500">Member since</dt>
            <dd className="text-slate-800 font-medium">
              {loading ? (
                <Skeleton className="h-4 w-20" />
              ) : createdAt ? (
                new Date(createdAt).toLocaleDateString()
              ) : (
                "-"
              )}
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