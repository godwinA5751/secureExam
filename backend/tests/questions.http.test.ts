import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Question } from "../src/models/Question";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";
const pad = (n: number) => String(n).padStart(3, "0");
const topicOf = (i: number) => (i < 20 ? "Networking" : i < 35 ? "Security" : "Databases");

let lecturer: Agent;
let other: Agent;
let testId: string;

async function newTest(agent: Agent): Promise<string> {
  const res = await agent
    .post("/api/tests")
    .send({
      title: "Review tools",
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  return res.body.test.id;
}

// 45 questions: 20 Networking, 15 Security, 10 Databases. Every third one is approved (15 approved, 30 pending).
function seedQuestions(id: string, count = 45) {
  return Question.insertMany(
    Array.from({ length: count }, (_, i) => ({
      testId: id,
      text: `Question ${pad(i)} about ${topicOf(i).toLowerCase()}`,
      options: ["a", "b", "c", "d"],
      correctOptionIndex: i % 4,
      topic: topicOf(i),
      approved: i % 3 === 0,
    }))
  );
}

const list = (qs = "") => lecturer.get(`/api/tests/${testId}/questions${qs}`).expect(200);

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  other = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Reviewer", email: "reviewer@example.com", password: PASSWORD })
    .expect(201);
  await other
    .post("/api/auth/lecturer/register")
    .send({ name: "Outsider", email: "outsider@example.com", password: PASSWORD })
    .expect(201);

  testId = await newTest(lecturer);
  await seedQuestions(testId);
}, 120_000);

afterAll(stopDb);

describe("listing and filtering", () => {
  it("pages 20 at a time and sends totals for the whole test", async () => {
    const p1 = await list();
    expect(p1.body.questions).toHaveLength(20);
    expect(p1.body).toMatchObject({ page: 1, pageSize: 20, total: 45, totalPages: 3 });
    expect(p1.body.summary).toMatchObject({ total: 45, approved: 15, pending: 30 });
    expect(p1.body.summary.topics).toEqual([
      { topic: "Databases", count: 10 },
      { topic: "Networking", count: 20 },
      { topic: "Security", count: 15 },
    ]);

    expect((await list("?page=3")).body.questions).toHaveLength(5);
  });

  it("shows the lecturer the answer key", async () => {
    const q = (await list("?pageSize=1")).body.questions[0];
    expect(typeof q.correctOptionIndex).toBe("number");
  });

  it("filters by status, topic and search text, and they combine", async () => {
    expect((await list("?status=pending")).body.total).toBe(30);
    expect((await list("?status=approved")).body.total).toBe(15);
    expect((await list("?topic=Databases")).body.total).toBe(10);
    expect((await list("?topic=Databases&status=approved")).body.total).toBe(3); // 36, 39, 42

    const found = await list("?q=QUESTION 007");
    expect(found.body.total).toBe(1);
    expect(found.body.questions[0].text).toContain("007");
  });

  it("keeps the summary about the whole test while filtering", async () => {
    const res = await list("?topic=Security&status=pending");
    expect(res.body.summary).toMatchObject({ total: 45, approved: 15, pending: 30 });
  });
});

describe("other lecturers", () => {
  it("cannot read, delete or bulk-change someone else's questions (404)", async () => {
    const someId = (await list("?pageSize=1")).body.questions[0].id;
    expect((await other.get(`/api/tests/${testId}/questions`)).status).toBe(404);
    expect((await other.delete(`/api/tests/${testId}/questions/${someId}`)).status).toBe(404);
    expect(
      (await other.post(`/api/tests/${testId}/questions/bulk`).send({ action: "delete", all: "pending" })).status
    ).toBe(404);
    expect((await list()).body.summary.total).toBe(45);
  });
});

describe("delete and bulk actions", () => {
  const pendingIds = async (n: number) =>
    (await list(`?status=pending&pageSize=${n}`)).body.questions.map((q: any) => q.id as string);

  it("deletes one question, and 404s on an unknown one", async () => {
    const [id] = await pendingIds(1);
    await lecturer.delete(`/api/tests/${testId}/questions/${id}`).expect(200);
    expect((await list()).body.summary).toMatchObject({ total: 44, approved: 15, pending: 29 });

    await lecturer.delete(`/api/tests/${testId}/questions/64b7f0c2a1b2c3d4e5f60718`).expect(404);
  });

  it("approves the selected questions", async () => {
    const ids = await pendingIds(3);
    const res = await lecturer.post(`/api/tests/${testId}/questions/bulk`).send({ action: "approve", ids }).expect(200);
    expect(res.body.affected).toBe(3);
    expect((await list()).body.summary).toMatchObject({ approved: 18, pending: 26 });
  });

  it("deletes the selected questions", async () => {
    const ids = await pendingIds(2);
    const res = await lecturer.post(`/api/tests/${testId}/questions/bulk`).send({ action: "delete", ids }).expect(200);
    expect(res.body.affected).toBe(2);
    expect((await list()).body.summary).toMatchObject({ total: 42, approved: 18, pending: 24 });
  });

  it("rejects malformed requests", async () => {
    const bulk = (body: object) => lecturer.post(`/api/tests/${testId}/questions/bulk`).send(body);
    expect((await bulk({ action: "explode", all: "pending" })).status).toBe(400);
    expect((await bulk({ action: "delete" })).status).toBe(400); // neither ids nor all
    expect((await bulk({ action: "delete", ids: ["x"], all: "pending" })).status).toBe(400); // both
    expect((await bulk({ action: "delete", ids: ["not-an-id"] })).status).toBe(400);
  });

  it("deletes every pending question and leaves the approved ones", async () => {
    const res = await lecturer
      .post(`/api/tests/${testId}/questions/bulk`)
      .send({ action: "delete", all: "pending" })
      .expect(200);
    expect(res.body.affected).toBe(24);
    expect((await list()).body.summary).toMatchObject({ total: 18, approved: 18, pending: 0 });
  });
});

describe("limits and frozen tests", () => {
  it("refuses to go past the per-test question cap", async () => {
    const id = await newTest(lecturer);
    await seedQuestions(id, 500);

    const add = await lecturer
      .post(`/api/tests/${id}/questions/manual`)
      .send({ text: "One too many?", options: ["a", "b"], correctOptionIndex: 0, topic: "Networking" });
    expect(add.status).toBe(400);
    expect(JSON.stringify(add.body)).toMatch(/at most/);

    const generate = await lecturer
      .post(`/api/tests/${id}/generate-questions`)
      .send({ topics: ["Networking"], count: 10 });
    expect(generate.status).toBe(400);
    expect(JSON.stringify(generate.body)).toMatch(/at most/);
  });

  it("freezes delete and bulk actions once the test is published", async () => {
    await Test.updateOne({ _id: testId }, { $set: { status: "published" } });
    const [id] = (await list("?pageSize=1")).body.questions.map((q: any) => q.id);

    expect((await lecturer.delete(`/api/tests/${testId}/questions/${id}`)).status).toBe(400);
    expect(
      (await lecturer.post(`/api/tests/${testId}/questions/bulk`).send({ action: "delete", all: "pending" })).status
    ).toBe(400);
    expect((await list()).body.summary.total).toBe(18);
  });
});