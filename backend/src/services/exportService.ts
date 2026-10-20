type ExportAttempt = {
  studentId?: { idNumber?: string } | null;
  status: string;
  score?: number | null;
  startedAt?: Date | null;
  submittedAt?: Date | null;
  visibilityEvents?: { type: string }[];
  shuffleMap?: { questionOrder?: unknown[] };
};

type ExportTest = {
  title: string;
  allowedStudents: string[];
  rosterNames?: { idNumber: string; name: string }[];
};

/** Safe CSV cell: neutralizes spreadsheet formulas and quotes commas, quotes and newlines. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Filename-safe version of a test title (ASCII only, so it is safe in a header). */
export function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "test"
  );
}

const isFocusLoss = (e: { type: string }) => e.type === "blur" || e.type === "hidden";

function endReasonOf(a: ExportAttempt): string {
  if (a.status === "submitted") return "submitted";
  if (a.status === "auto-submitted") {
    // A blur/hidden event force-submits immediately, so its presence explains the auto-submit.
    return (a.visibilityEvents ?? []).some(isFocusLoss) ? "focus-loss" : "time-up";
  }
  return "";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const RESULT_COLUMNS = [
  "idNumber",
  "name",
  "status",
  "score",
  "submittedAt",
  "total",
  "percent",
  "startedAt",
  "minutesTaken",
  "endReason",
  "focusLossEvents",
  "testTitle",
];

export function buildResultsCsv(test: ExportTest, attempts: ExportAttempt[]): string {
  const nameById = new Map((test.rosterNames ?? []).map((r) => [r.idNumber, r.name]));
  const rows = new Map<string, (string | number)[]>();

  for (const a of attempts) {
    const idNumber = a.studentId?.idNumber ?? "";
    const total = a.shuffleMap?.questionOrder?.length ?? "";
    const hasScore = typeof a.score === "number";
    rows.set(idNumber, [
      idNumber,
      nameById.get(idNumber) ?? "",
      a.status,
      hasScore ? (a.score as number) : "",
      a.submittedAt ? a.submittedAt.toISOString() : "",
      total,
      hasScore && total ? round1(((a.score as number) / (total as number)) * 100) : "",
      a.startedAt ? a.startedAt.toISOString() : "",
      a.startedAt && a.submittedAt ? round1((a.submittedAt.getTime() - a.startedAt.getTime()) / 60000) : "",
      endReasonOf(a),
      (a.visibilityEvents ?? []).filter(isFocusLoss).length,
      test.title,
    ]);
  }

  // Roster students who never started appear as "not-started" so absences are visible.
  for (const id of test.allowedStudents) {
    if (!rows.has(id)) {
      rows.set(id, [id, nameById.get(id) ?? "", "not-started", "", "", "", "", "", "", "", "", test.title]);
    }
  }

  const sorted = [...rows.values()].sort((a, b) =>
    String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })
  );
  return [RESULT_COLUMNS, ...sorted].map((r) => r.map(csvCell).join(",")).join("\r\n");
}