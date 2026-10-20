import { describe, it, expect } from "vitest";
import { buildResultsCsv, csvCell, fileSlug, RESULT_COLUMNS } from "../src/services/exportService";

const test = {
  title: "Intro to CS, Midterm",
  allowedStudents: ["CSC/001", "CSC/002", "CSC/003"],
  rosterNames: [
    { idNumber: "CSC/001", name: "Ngozi Okafor" },
    { idNumber: "CSC/002", name: "Adeyemi, Tunde" },
  ],
};

const t = (iso: string) => new Date(iso);

function lines(csv: string) {
  return csv.split("\r\n");
}

describe("buildResultsCsv", () => {
  const attempts = [
    {
      studentId: { idNumber: "CSC/001" },
      status: "submitted",
      score: 3,
      startedAt: t("2026-10-19T10:00:00Z"),
      submittedAt: t("2026-10-19T10:12:30Z"),
      visibilityEvents: [],
      shuffleMap: { questionOrder: [1, 2, 3, 4] },
    },
    {
      studentId: { idNumber: "CSC/002" },
      status: "auto-submitted",
      score: 1,
      startedAt: t("2026-10-19T10:00:00Z"),
      submittedAt: t("2026-10-19T10:03:00Z"),
      visibilityEvents: [{ type: "blur" }],
      shuffleMap: { questionOrder: [1, 2, 3, 4] },
    },
  ];
  const out = lines(buildResultsCsv(test, attempts));

  it("keeps the original five columns first, then the new ones", () => {
    expect(out[0]).toBe(RESULT_COLUMNS.join(","));
    expect(RESULT_COLUMNS.slice(0, 5)).toEqual(["idNumber", "name", "status", "score", "submittedAt"]);
  });

  it("computes total, percent and minutes taken", () => {
    expect(out[1]).toContain("CSC/001,Ngozi Okafor,submitted,3,2026-10-19T10:12:30.000Z,4,75,");
    expect(out[1]).toContain(",12.5,submitted,0,");
  });

  it("labels the end reason from the recorded events", () => {
    expect(out[2]).toContain(",focus-loss,1,");
  });

  it("quotes names that contain commas", () => {
    expect(out[2]).toContain('"Adeyemi, Tunde"');
  });

  it("lists roster students who never started as not-started", () => {
    expect(out[3].startsWith("CSC/003,,not-started,")).toBe(true);
  });

  it("labels an attempt with no focus events that ended on its own as time-up", () => {
    const csv = buildResultsCsv(test, [
      { ...attempts[0], status: "auto-submitted" },
    ]);
    expect(lines(csv)[1]).toContain(",time-up,0,");
  });
});

describe("csvCell and fileSlug", () => {
  it("neutralizes formulas and escapes quotes", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("makes a safe filename from a title", () => {
    expect(fileSlug("Intro to CS: Midterm #1!")).toBe("intro-to-cs-midterm-1");
    expect(fileSlug("???")).toBe("test");
  });
});