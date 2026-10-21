import request from "supertest";
import { Types } from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Test } from "../src/models/Test";
import { User } from "../src/models/User";
import { Attempt } from "../src/models/Attempt";
import { generateLinkToken } from "../src/utils/token";
import { startDb, stopDb } from "./helpers/db";

const PASSWORD = "correct-horse-battery";
let lecturer: ReturnType<typeof request.agent>;
let lecturerId: string;
let fixtureId: string;

function testDoc(overrides: Record<string, unknown>) {
  return {
    lecturerId,
    title: "Test",
    topics: ["x"],
    instructions: "",
    loginWindowStart: new Date(),
    loginWindowEnd: new Date(Date.now() + 3_600_000),
    durationMinutes: 30,
    linkToken: generateLinkToken(),
    questionGenMode: "manual",
    allowedStudents: [],
    requiresAccessCode: false,
    accessCodeHash: null,
    status: "draft",
    window: "closed",
    ...overrides,
  };
}

const pad = (n: number) => String(n).padStart(3, "0");

beforeAll(async () => {
  await startDb();

  lecturer = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Pager", email: "pager@example.com", password: PASSWORD })
    .expect(201);
  lecturerId = (await lecturer.get("/api/auth/lecturer/me").expect(200)).body.id;

  // 12 tests: 4 published, 8 drafts, 3 students on each roster (36 students).
  await Test.insertMany(
    Array.from({ length: 12 }, (_, i) =>
      testDoc({
        title: `List test ${i + 1}`,
        status: i < 4 ? "published" : "draft",
        window: i < 4 ? "opened" : "closed",
        allowedStudents: ["A/001", "A/002", "A/003"],
      })
    )
  );

  // Results fixture: 30 students, 20 submitted then 10 auto-submitted, 4 questions each.
  const ids = Array.from({ length: 30 }, (_, i) => `P/${pad(i + 1)}`);
  const fixture = await Test.create(
    testDoc({
      title: "Results fixture",
      status: "published",
      window: "opened",
      allowedStudents: ids,
      rosterNames: ids.map((id, i) => ({
        idNumber: id,
        name: i === 6 ? "Chidi Eze" : `Student Number ${pad(i + 1)}`,
      })),
    })
  );
  fixtureId = String(fixture._id);

  const users = await User.insertMany(ids.map((id) => ({ role: "student", idNumber: id, name: id })));
  const questionOrder = Array.from({ length: 4 }, () => new Types.ObjectId());
  await Attempt.insertMany(
    users.map((u, i) => ({
      testId: fixture._id,
      studentId: u._id,
      status: i < 20 ? "submitted" : "auto-submitted",
      shuffleMap: { questionOrder, optionOrder: {} },
      answers: [],
      score: i % 5, // 0..4, six of each: average exactly 2
      startedAt: new Date(Date.UTC(2026, 9, 19, 9, 0, 0)),
      deadline: new Date(Date.UTC(2026, 9, 19, 10, 0, 0)),
      submittedAt: new Date(Date.UTC(2026, 9, 19, 9, 30, i)), // later index = later submission
    }))
  );
}, 120_000);

afterAll(stopDb);

// ---------- tests list ----------

describe("tests list pagination", () => {
  const list = (qs = "") => lecturer.get(`/api/tests${qs}`).expect(200);

  it("returns the first page of 10 with totals across all 13 tests", async () => {
    const res = await list();
    expect(res.body.tests).toHaveLength(10);
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, total: 13, totalPages: 2 });
    expect(res.body.tests[0]).toHaveProperty("rosterCount");
  });

  it("returns the rest on page 2, with no overlap, and honours a custom page size", async () => {
    const first = await list("?page=1");
    const second = await list("?page=2");
    expect(second.body.tests).toHaveLength(3);

    const firstIds = new Set(first.body.tests.map((t: any) => t.id));
    expect(second.body.tests.some((t: any) => firstIds.has(t.id))).toBe(false);

    const small = await list("?page=2&pageSize=5");
    expect(small.body.tests).toHaveLength(5);
    expect(small.body).toMatchObject({ page: 2, pageSize: 5, totalPages: 3 });
  });

  it("clamps oversized page sizes and treats junk parameters as the defaults", async () => {
    const big = await list("?pageSize=1000");
    expect(big.body.pageSize).toBe(50);
    expect(big.body.tests).toHaveLength(13);

    for (const qs of ["?page=abc", "?page=0", "?page=-5", "?pageSize=zero"]) {
      const res = await list(qs);
      expect(res.body.page).toBe(1);
      expect(res.body.tests.length).toBeGreaterThan(0);
    }
  });

  it("lists newest first", async () => {
    const res = await list("?pageSize=50");
    const times = res.body.tests.map((t: any) => new Date(t.createdAt).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
  });

  it("sends summary totals for the whole account, not just the page", async () => {
    const res = await list("?pageSize=5");
    // 4 published list tests + the fixture; 8 drafts; 12 x 3 + 30 students.
    expect(res.body.summary).toEqual({ total: 13, published: 5, drafts: 8, students: 66 });
  });

  it("shows another lecturer none of these tests", async () => {
    const other = request.agent(app);
    await other
      .post("/api/auth/lecturer/register")
      .send({ name: "Other", email: "other-pager@example.com", password: PASSWORD })
      .expect(201);

    const res = await other.get("/api/tests").expect(200);
    expect(res.body.tests).toEqual([]);
    expect(res.body).toMatchObject({ total: 0, totalPages: 1 });
    expect(res.body.summary).toEqual({ total: 0, published: 0, drafts: 0, students: 0 });
  });
});

// ---------- results ----------

describe("results pagination, search and summary", () => {
  const results = (qs = "") => lecturer.get(`/api/tests/${fixtureId}/results${qs}`).expect(200);

  it("returns 25 per page by default, then the remaining 5, and nothing beyond", async () => {
    const p1 = await results();
    expect(p1.body.results).toHaveLength(25);
    expect(p1.body).toMatchObject({ page: 1, pageSize: 25, total: 30, totalPages: 2 });

    const p2 = await results("?page=2");
    expect(p2.body.results).toHaveLength(5);

    const beyond = await results("?page=9");
    expect(beyond.body.results).toEqual([]);
    expect(beyond.body.total).toBe(30);
  });

  it("orders newest submission first across pages", async () => {
    expect((await results()).body.results[0].idNumber).toBe("P/030");

    const third = await results("?pageSize=10&page=3");
    expect(third.body.results).toHaveLength(10);
    expect(third.body.results[0].idNumber).toBe("P/010");
    expect(third.body.results[9].idNumber).toBe("P/001");
  });

  it("clamps the page size to 100", async () => {
    const res = await results("?pageSize=1000");
    expect(res.body.pageSize).toBe(100);
    expect(res.body.results).toHaveLength(30);
  });

  it("filters by status", async () => {
    const res = await results("?status=auto-submitted");
    expect(res.body.total).toBe(10);
    expect(res.body.results.every((r: any) => r.status === "auto-submitted")).toBe(true);
  });

  it("searches by student ID fragment", async () => {
    const res = await results("?q=p/01");
    expect(res.body.total).toBe(10); // P/010 to P/019
    expect(res.body.results.every((r: any) => r.idNumber.startsWith("P/01"))).toBe(true);
  });

  it("searches by name", async () => {
    const res = await results("?q=chidi");
    expect(res.body.total).toBe(1);
    expect(res.body.results[0]).toMatchObject({ idNumber: "P/007", name: "Chidi Eze" });
  });

  it("combines search with the status filter", async () => {
    const res = await results("?q=p/02&status=auto-submitted");
    expect(res.body.total).toBe(9); // P/021 to P/029 (P/020 was submitted normally)
  });

  it("keeps the stat summary about the whole test whatever the search says", async () => {
    const expected = { submitted: 20, autoSubmitted: 10, averageScore: 2, totalPossible: 4 };
    expect((await results()).body.summary).toEqual(expected);
    expect((await results("?q=chidi")).body.summary).toEqual(expected);
    expect((await results("?status=auto-submitted&pageSize=10")).body.summary).toEqual(expected);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const res = await results("?q=zzzz");
    expect(res.body.results).toEqual([]);
    expect(res.body).toMatchObject({ total: 0, totalPages: 1 });
    expect(res.body.summary.submitted).toBe(20);
  });
});