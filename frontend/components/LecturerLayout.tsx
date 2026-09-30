import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { tokenStore } from "../lib/api";

const NAV_ITEMS = [
  { href: "/lecturer/dashboard", label: "Dashboard" },
  { href: "/lecturer/tests", label: "Tests" },
  { href: "/lecturer/create-test", label: "Create test" },
  { href: "/lecturer/profile", label: "Profile" },
];

export default function LecturerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    tokenStore.clear("lecturerToken");
    router.push("/lecturer/login");
  }

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <nav className="sticky top-0 z-20 bg-[#14133b] text-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/lecturer/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-500 text-xs">
                SE
              </span>
              SecureExam
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    router.pathname === item.href
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="ml-2 px-3 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/5"
              >
                Log out
              </button>
            </div>

            <button
              className="md:hidden p-2 text-white/80"
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6l-12 12" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 px-4 py-2 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm ${
                  router.pathname === item.href ? "bg-white/10 text-white" : "text-white/70"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2 rounded-md text-sm text-white/70"
            >
              Log out
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}