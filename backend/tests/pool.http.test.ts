import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { startDb, stopDb } from "./helpers/db";
import { User } from "../src/models/User";
import { Attempt } from "../src/models/Attempt";
import { Question } from "../src/models/Question";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";

// 6 questions, 2 topics. Correct option text is unique per question so we can find it after shuffling.
const POOL = Array.from({ length: 6 }, (_, i) => ({
  text: `Pool question ${i + 1}?`,
  options: [`RIGHT-${i}`, `wrong-${i}-a`, `wrong-${i}-b`, `wrong-${i}-c`],
  correctOptionIndex: 0,
  topic: i < 3 ? "Networking" : "Security",
}));
const rightText = new Map(POOL.map((q) => [q.text, q.options[0]]));

let lecturer: Agent;
let exam: { id: string; linkToken: string; accessCode: string };

async function loginStudent(idNumber: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/student/login")
    .send({ linkToken: exam.linkToken, idNumber, accessCode: exam.accessCode })
    .expect(200);
  return agent;
}

/** Answers every question; the first `correct` of them correctly, the rest wrongly. */
async function sitExam(student: Agent, correct: number) {
  await student.post(`/api/attempts/${exam.linkToken}/start`).expect(200);
  const qs = (await student.get(`/api/attempts/${exam.linkToken}/questions`).expect(200)).body.questions;
  for (let i = 0; i < qs.length; i++) {
    const right = rightText.get(qs[i].text)!;
    const index =
      i < correct
        ? qs[i].options.indexOf(right)
        : qs[i].options.findIndex((o: string) => o !== right);
    await student
      .post(`/api/attempts/${exam.linkToken}/answer`)
      .send({ questionId: qs[i].id, selectedOptionIndex: index })
      .expect(200);
  }
  return (await student.post(`/api/attempts/${exam.linkToken}/submit`).expect(200)).body;
}

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Pool Lecturer", email: "pool@example.com", password: PASSWORD })
    .expect(201);

  const created = await lecturer
    .post("/api/tests")
    .send({
      title: "Pool test",
      topics: ["Networking", "Security"],
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  exam = {
    id: created.body.test.id,
    linkToken: created.body.test.linkToken,
    accessCode: created.body.accessCode,
  };

  for (const q of POOL) {
    await lecturer.post(`/api/tests/${exam.id}/questions/manual`).send(q).expect(201);
  }
  await lecturer
    .post(`/api/tests/${exam.id}/roster`)
    .attach("roster", Buffer.from("POOL/001\nPOOL/002\nPOOL/003\n"), { filename: "r.csv", contentType: "text/csv" })
    .expect(200);
}, 120_000);

afterAll(stopDb);

describe("question pool and marks", () => {
  it("rejects invalid settings", async () => {
    await lecturer.patch(`/api/tests/${exam.id}/settings`).send({ marksPerQuestion: 3 }).expect(400);
    await lecturer.patch(`/api/tests/${exam.id}/settings`).send({ questionsPerStudent: 0 }).expect(400);
  });

  it("refuses to publish when more questions per student are set than are approved", async () => {
    await lecturer.patch(`/api/tests/${exam.id}/settings`).send({ questionsPerStudent: 10 }).expect(200);
    const res = await lecturer.post(`/api/tests/${exam.id}/link`);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/approved/i);
  });

  it("publishes with 3 questions per student at 2 marks each, then freezes the settings", async () => {
    await lecturer
      .patch(`/api/tests/${exam.id}/settings`)
      .send({ questionsPerStudent: 3, marksPerQuestion: 2 })
      .expect(200);
    await lecturer.post(`/api/tests/${exam.id}/link`).expect(200);

    const frozen = await lecturer.patch(`/api/tests/${exam.id}/settings`).send({ marksPerQuestion: 1 });
    expect(frozen.status).toBe(400);
  });

  it("describes each student's own exam in the briefing and in the questions", async () => {
    const s = await loginStudent("POOL/001");

    const info = await s.get(`/api/attempts/${exam.linkToken}/info`).expect(200);
    expect(info.body).toMatchObject({ state: "not-started", questionCount: 3, marksPerQuestion: 2, totalMarks: 6 });

    await s.post(`/api/attempts/${exam.linkToken}/start`).expect(200);
    const res = await s.get(`/api/attempts/${exam.linkToken}/questions`).expect(200);
    expect(res.body.questions).toHaveLength(3);
        // Balanced: with two topics and 3 questions, the server must have picked from both.
    const user = await User.findOne({ idNumber: "POOL/001" });
    const attempt = await Attempt.findOne({ studentId: user!._id });
    const picked = await Question.find({ _id: { $in: attempt!.shuffleMap.questionOrder } });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((q) => q.topic)).size).toBe(2);
  });

  it("scores in marks: all correct is 6 of 6, one correct is 2 of 6", async () => {
    const full = await sitExam(await loginStudent("POOL/002"), 3);
    expect(full).toMatchObject({ score: 6, total: 6 });

    const partial = await sitExam(await loginStudent("POOL/003"), 1);
    expect(partial).toMatchObject({ score: 2, total: 6 });
  });

  it("shows marks on the lecturer results, with summary totals in marks", async () => {
    const res = await lecturer.get(`/api/tests/${exam.id}/results`).expect(200);
    const rows = res.body.results;
    expect(rows.find((r: any) => r.idNumber === "POOL/002")).toMatchObject({ score: 6, total: 6 });
    expect(rows.find((r: any) => r.idNumber === "POOL/003")).toMatchObject({ score: 2, total: 6 });
    expect(res.body.summary).toMatchObject({ totalPossible: 6, averageScore: 4 });
  });
});