
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/router";
import LecturerLayout from "../../components/LecturerLayout";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api";
import { useMe, clearCache } from "../../lib/hooks";

export default function Profile() {
  const router = useRouter();
  const { data, error: loadError, isLoading: loading } = useMe();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setEmail(data.email);
    }
  }, [data]);

  const createdAt = data?.createdAt ?? "";

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

  async function handleProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setProfileError("");
    setProfileSuccess("");

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 100) {
      setProfileError("Name must be between 2 and 100 characters.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setProfileError("Please enter a valid email address.");
      return;
    }

    setSavingProfile(true);

    try {
      const result = await api.updateLecturerProfile({
        name: cleanName,
        email: cleanEmail,
      });

      setName(result.profile.name);
      setEmail(result.profile.email);
      setEditing(false);
      setProfileSuccess("Your profile was updated successfully.");
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Unable to update your profile."
      );
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileSuccess(""), 5000);
    }
  }

    async function handlePasswordChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setPasswordError("");
    setPasswordSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please complete all password fields.");
      return;
    }

    if (newPassword.length < 10 || newPassword.length > 128) {
      setPasswordError("New password must be between 10 and 128 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(
        "Your new password must be different from your current password."
      );
      return;
    }

    setChangingPassword(true);

    try {
      await api.changeLecturerPassword(currentPassword, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);
      setShowPasswordModal(false);

      setPasswordSuccess(
        "Password changed successfully. Other active sessions have been signed out."
      );
    } catch (error) {
      setPasswordError(
        error instanceof Error
          ? error.message
          : "Unable to change your password."
      );
    } finally {
      setChangingPassword(false);
      setTimeout(() => setPasswordSuccess(""), 5000);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await api.logout();
      clearCache();
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      router.push("/lecturer/login");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";

  const labelClass = "mb-2 block text-sm font-medium text-slate-700";

  const buttonClass =
    "inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

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
            Manage your personal information, password and account security.
          </p>
        </div>

        {/* Profile loading error */}
        {loadError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            Unable to load profile: {String(loadError)}
          </div>
        )}

        <div
          className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.5fr_1fr]"
          aria-busy={loading}
        >
          {/* Personal information */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <h2 className="text-base font-bold text-slate-900">
                Personal information
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Manage your lecturer account details.
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

              {/* Profile form */}
              <div className="pt-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Account details
                  </h3>

                  {!editing && (
                    <button
                      type="button"
                      disabled={loading || !data}
                      onClick={() => {
                        setProfileError("");
                        setProfileSuccess("");
                        setEditing(true);
                      }}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      Edit details
                    </button>
                  )}
                </div>

                {profileError && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  >
                    {profileError}
                  </div>
                )}

                {profileSuccess && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
                  >
                    {profileSuccess}
                  </div>
                )}

                {editing ? (
                  <form onSubmit={handleProfileSave} className="space-y-5">
                    <div>
                      <label htmlFor="profile-name" className={labelClass}>
                        Full name
                      </label>
                      <input
                        id="profile-name"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div>
                      <label htmlFor="profile-email" className={labelClass}>
                        Email address
                      </label>
                      <input
                        id="profile-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        placeholder="Enter your email address"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Your email address is also used when signing in to
                        SecureExam.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={savingProfile || loading}
                        className={buttonClass}
                      >
                        {savingProfile ? "Saving changes..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        disabled={savingProfile}
                        onClick={() => {
                          setName(data?.name ?? "");
                          setEmail(data?.email ?? "");
                          setProfileError("");
                          setEditing(false);
                        }}
                        className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
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
                )}
              </div>
            </div>
          </section>

          {/* Security and logout */}
          <div className="space-y-6">
            {/* Account security */}
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

              {/* Password management */}
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-slate-900">
                Password
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                Keep your account secure by using a strong, unique password.
              </p>

              {passwordSuccess && (
                <div
                  role="status"
                  className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
                >
                  {passwordSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setPasswordError("");
                  setPasswordSuccess("");
                  setShowPasswords(false);
                  setShowPasswordModal(true);
                }}
                disabled={loading}
                className="mt-5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Change password
              </button>

              <p className="mt-4 text-xs leading-5 text-slate-400">
                Changing your password signs out other active sessions.
                This device will remain signed in.
              </p>
            </div>
            </section>

            {/* Logout */}
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
                disabled={loggingOut}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                {loggingOut ? "Signing out..." : "Log out of SecureExam"}
              </button>
            </section>
          </div>
        </div>

        {/* Change password modal */}
        {showPasswordModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !changingPassword) {
                setShowPasswordModal(false);
                setPasswordError("");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setShowPasswords(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
              className="my-auto w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl sm:p-7"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <rect
                        x="4"
                        y="10"
                        width="16"
                        height="11"
                        rx="2"
                      />
                      <path
                        d="M8 10V7a4 4 0 0 1 8 0v3"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 14v3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <h2
                    id="change-password-title"
                    className="text-lg font-bold text-slate-900"
                  >
                    Change your password
                  </h2>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    Enter your current password and choose a new one.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={changingPassword}
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError("");
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setShowPasswords(false);
                  }}
                  aria-label="Close modal"
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                  >
                    <path
                      d="m18 6-12 12M6 6l12 12"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Error message */}
              {passwordError && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {passwordError}
                </div>
              )}

              {/* Password form */}
              <form
                onSubmit={handlePasswordChange}
                className="mt-6 space-y-4"
              >
                <div>
                  <label
                    htmlFor="current-password"
                    className={labelClass}
                  >
                    Current password
                  </label>

                  <input
                    id="current-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Enter current password"
                    required
                    disabled={changingPassword}
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-password"
                    className={labelClass}
                  >
                    New password
                  </label>

                  <input
                    id="new-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={128}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass}
                    placeholder="At least 10 characters"
                    required
                    disabled={changingPassword}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className={labelClass}
                  >
                    Confirm new password
                  </label>

                  <input
                    id="confirm-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Re-enter new password"
                    required
                    disabled={changingPassword}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={showPasswords}
                    onChange={(e) => setShowPasswords(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    disabled={changingPassword}
                  />
                  Show passwords
                </label>

                <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row">
                  <button
                    type="button"
                    disabled={changingPassword}
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordError("");
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setShowPasswords(false);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={changingPassword}
                    className={`${buttonClass} w-full`}
                  >
                    {changingPassword
                      ? "Changing password..."
                      : "Update password"}
                  </button>
                </div>
              </form>

              <p className="mt-5 text-xs leading-5 text-slate-400">
                For your security, other active sessions will be signed out
                after a successful password change.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-1 border-t border-slate-200 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>SecureExam · Lecturer workspace</p>
          <p>Manage your assessments with confidence.</p>
        </div>
      </div>
    </LecturerLayout>
  );
}
