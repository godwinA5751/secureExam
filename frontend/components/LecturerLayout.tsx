
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { api } from "../lib/api";
import { clearCache } from "../lib/hooks";

const NAV_ITEMS = [
  {
    href: "/lecturer/dashboard",
    label: "Overview",
    icon: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  },
  {
    href: "/lecturer/tests",
    label: "All tests",
    icon: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  },
  {
    href: "/lecturer/create-test",
    label: "Create test",
    icon: "M12 5v14 M5 12h14",
  },
  {
    href: "/lecturer/profile",
    label: "Profile",
    icon: "M20 21a8 8 0 0 0-16 0 M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
];

export default function LecturerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/lecturer/dashboard") {
      return router.pathname === href;
    }

    return router.pathname === href || router.pathname.startsWith(`${href}/`);
  };

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

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 lg:hidden">
        <Link
          href="/lecturer/dashboard"
          className="flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
            SE
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Secure<span className="text-blue-600">Exam</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {menuOpen ? (
              <path d="M18 6 6 18M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile overlay */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-[#111b35] text-white transition-transform duration-300 lg:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold shadow-lg shadow-blue-500/20">
            SE
          </span>
          <div>
            <p className="text-lg font-bold tracking-tight">
              Secure<span className="text-blue-400">Exam</span>
            </p>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Lecturer workspace
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-7">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>

          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <svg
                    width="19"
                    height="19"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <path d={item.icon} />
                  </svg>
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3 14.5 8.5 20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5L12 3z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-white">
              SecureExam workspace
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              Manage your tests and keep your examination process organized.
            </p>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
            </svg>
            Log out
          </button>
          <p className="mt-3 px-3 text-[10px] text-slate-600">
            SecureExam · Lecturer Portal
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-screen pt-16 lg:ml-[260px] lg:pt-0">
        <div className="mx-auto w-full max-w-[1600px] p-5 sm:p-7 lg:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
