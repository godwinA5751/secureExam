import Link from "next/link";
import { useEffect, useState } from "react";

const features = [
  {
    number: "01",
    title: "AI-assisted question creation",
    description:
      "Generate questions from your topics or learning materials, then review and approve them before publishing.",
    icon: "✦",
  },
  {
    number: "02",
    title: "Controlled online examinations",
    description:
      "Configure examination windows, durations, access codes and student eligibility from one place.",
    icon: "◷",
  },
  {
    number: "03",
    title: "Flexible student management",
    description:
      "Upload student rosters, reuse saved rosters and manage who can access each examination.",
    icon: "♧",
  },
  {
    number: "04",
    title: "Results and performance",
    description:
      "Review submitted attempts, scores and student performance without manually marking every response.",
    icon: "↗",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your examination",
    description:
      "Set up your test, add questions or use AI assistance to prepare them.",
  },
  {
    number: "02",
    title: "Invite your students",
    description:
      "Upload your roster and share the examination link and access details.",
  },
  {
    number: "03",
    title: "Review the results",
    description:
      "Monitor submissions and review student results from your dashboard.",
  },
];

function BrandMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
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

function ArrowIcon({ light = false }: { light?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 ${light ? "text-white" : "text-current"}`}
      aria-hidden="true"
    >
      <path
        d="M4 10h12m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[570px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-blue-500/20 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-slate-950/30">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div>
              <p className="text-sm font-bold text-slate-900">SecureExam</p>
              <p className="text-[10px] text-slate-400">Lecturer workspace</p>
            </div>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-full bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Dashboard overview
          </div>
        </div>

        <div className="bg-slate-50/80 p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-slate-900">
                Good morning, Lecturer
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Here&apos;s your examination overview.
              </p>
            </div>
            <div className="hidden rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-semibold text-white sm:block">
              + Create test
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Total tests", value: "12", icon: "▤" },
              { label: "Students", value: "248", icon: "♧" },
              { label: "Submissions", value: "186", icon: "✓" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-100 bg-white p-3 sm:p-4"
              >
                <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-xs text-blue-600">
                  {item.icon}
                </div>
                <p className="text-xl font-bold text-slate-900 sm:text-2xl">
                  {item.value}
                </p>
                <p className="mt-1 text-[9px] text-slate-500 sm:text-[11px]">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  Recent examinations
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  Keep track of your tests
                </p>
              </div>
              <span className="text-[10px] font-semibold text-blue-600">
                View all
              </span>
            </div>

            {[
              {
                title: "Introduction to Computer Science",
                detail: "42 students",
                status: "Published",
                color: "bg-emerald-50 text-emerald-700",
              },
              {
                title: "Database Management Systems",
                detail: "36 students",
                status: "Draft",
                color: "bg-amber-50 text-amber-700",
              },
              {
                title: "Web Development Fundamentals",
                detail: "58 students",
                status: "Completed",
                color: "bg-blue-50 text-blue-700",
              },
            ].map((test) => (
              <div
                key={test.title}
                className="flex items-center justify-between gap-3 border-t border-slate-100 py-3 first:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-slate-800 sm:text-xs">
                    {test.title}
                  </p>
                  <p className="mt-1 text-[9px] text-slate-400">
                    {test.detail}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold ${test.color}`}
                >
                  {test.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-white/10 bg-slate-900 px-4 py-3 shadow-xl sm:block">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-lg text-emerald-400">
            ✓
          </div>
          <div>
            <p className="text-xs font-semibold text-white">
              Examination managed
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              From setup to results
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const sectionIds = ["features", "how-it-works", "about"];

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              b.intersectionRatio - a.intersectionRatio
          );

        if (visibleSections.length > 0) {
          setActiveSection(visibleSections[0].target.id);
        }
      },
      {
        rootMargin: "-100px 0px -45% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75],
      }
    );

    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, []);

  const navLinkClass = (id: string) =>
    `text-sm font-medium transition-colors duration-200 ${
      activeSection === id
        ? "text-blue-600"
        : "text-slate-600 hover:text-blue-600"
    }`;

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-900">
      
      {/* Navigation */}
      <header className="fixed top-0 z-50 w-full border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md">
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-3"
            onClick={() => setMobileMenuOpen(false)}
          >
            <BrandMark />
            <span className="text-xl font-bold tracking-tight text-slate-950">
              Secure<span className="text-blue-600">Exam</span>
            </span>
          </Link>

          {/* Desktop navigation */}
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              aria-current={activeSection === "features" ? "location" : undefined}
              className={navLinkClass("features")}
            >
              Features
            </a>

            <a
              href="#how-it-works"
              aria-current={activeSection === "how-it-works" ? "location" : undefined}
              className={navLinkClass("how-it-works")}
            >
              How it works
            </a>

            <a
              href="#about"
              aria-current={activeSection === "about" ? "location" : undefined}
              className={navLinkClass("about")}
            >
              About
            </a>
          </div>

          {/* Desktop actions and mobile menu button */}
          <div className="flex items-center gap-3">
            <Link
              href="/lecturer/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
            >
              Sign in
            </Link>

            <Link
              href="/lecturer/register"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 sm:text-sm"
            >
              Get started <ArrowIcon light />
            </Link>

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50 md:hidden"
            >
              {mobileMenuOpen ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile navigation dropdown */}
          {mobileMenuOpen && (
            <div
              id="mobile-navigation"
              className="absolute left-0 right-0 top-full border-t border-slate-100 bg-white px-5 py-5 shadow-xl md:hidden"
            >
              <div className="flex flex-col gap-1">
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-4 py-3 ${navLinkClass("features")}`}
                >
                  Features
                </a>

                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-4 py-3 ${navLinkClass("how-it-works")}`}
                >
                  How it works
                </a>

                <a
                  href="#about"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-4 py-3 ${navLinkClass("about")}`}
                >
                  About
                </a>

                <div className="my-2 border-t border-slate-100" />

                <Link
                  href="/lecturer/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-blue-600"
                >
                  Sign in
                </Link>

                <Link
                  href="/lecturer/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-1 rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Create lecturer account
                </Link>
              </div>
            </div>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[#08142B]">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-blue-600/20 blur-[110px]" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.35)_1px,transparent_1px)] [background-size:52px_52px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:px-10 lg:py-28">
          <div className="max-w-xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3.5 py-2 text-xs font-medium text-blue-200 mt-4 md:mt-2 lg:mt-0">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              Smarter online examinations
            </div>

            <h1 className="text-4xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[3.65rem]">
              Better exams.
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                Simpler management.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-8 text-slate-300 sm:text-lg">
              Create, manage and evaluate online examinations with confidence.
              SecureExam gives lecturers the tools to organize assessments and
              manage student participation in one place.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/lecturer/register"
                className="inline-flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500"
              >
                Create lecturer account <ArrowIcon light />
              </Link>
              <Link
                href="/lecturer/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Sign in to your account
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                Lecturer-managed tests
              </span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                AI-assisted question creation
              </span>
            </div>
          </div>

          <div className="px-2 py-3 sm:px-5 lg:px-0">
            <DashboardPreview />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
      </section>

      {/* Trust / intro strip */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-7 text-center sm:px-8 md:flex-row md:text-left lg:px-10">
          <p className="text-sm font-semibold text-slate-700">
            Everything lecturers need to run an organized online examination.
          </p>
          <p className="text-xs text-slate-400">
            Create · Manage · Assess · Review
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
              Platform features
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Everything in one examination workspace
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-500 sm:text-base">
              From preparing questions to reviewing submissions, manage your
              examination process with a clear and organized workflow.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.number}
                className="group rounded-2xl border border-slate-200/80 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-slate-200/60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                    {feature.icon}
                  </div>
                  <span className="text-xs font-semibold tracking-widest text-slate-300">
                    {feature.number}
                  </span>
                </div>
                <h3 className="mt-7 text-base font-bold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="scroll-mt-20 bg-white py-20 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                Simple workflow
              </p>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                From test creation to results, without the complexity.
              </h2>
              <p className="mt-5 text-sm leading-7 text-slate-500 sm:text-base">
                SecureExam is designed around the way lecturers manage
                assessments: prepare the test, give students access and review
                the outcome.
              </p>
              <Link
                href="/lecturer/register"
                className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-blue-600 transition hover:gap-3"
              >
                Get started with SecureExam <ArrowIcon />
              </Link>
            </div>

            <div className="space-y-4">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="flex gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-6"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/15">
                    {step.number}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About / CTA */}
      <section id="about" className="scroll-mt-20 px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[#0B1932] px-6 py-14 text-center sm:px-12 sm:py-16">
          <div className="absolute -left-20 -top-28 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
              Take control of your assessments
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Make your next examination easier to manage.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
              Create your lecturer account and bring your examination workflow
              into one organized platform.
            </p>
            <Link
              href="/lecturer/register"
              className="mt-8 inline-flex items-center gap-3 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500"
            >
              Get started <ArrowIcon light />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-7 sm:px-8 md:flex-row lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-bold tracking-tight text-slate-900">
              Secure<span className="text-blue-600">Exam</span>
            </span>
          </Link>

          <p className="text-center text-xs text-slate-400">
            © {new Date().getFullYear()} SecureExam. All rights reserved.
          </p>

          <div className="flex items-center gap-5 text-xs font-medium text-slate-500">
            <Link
              href="/lecturer/login"
              className="transition hover:text-blue-600"
            >
              Lecturer sign in
            </Link>
            <Link
              href="/lecturer/register"
              className="transition hover:text-blue-600"
            >
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
