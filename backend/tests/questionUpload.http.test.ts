import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Question } from "../src/models/Question";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";

let lecturer: Agent;
let other: Agent;

async function newTest(): Promise<string> {
  const res = await lecturer
    .post("/api/tests")
    .send({
      title: "Upload test",
      topics: ["Networking", "Databases"],
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  return res.body.test.id;
}

const upload = (agent: Agent, id: string, csv: string | Buffer, opts: { topic?: string; mime?: string } = {}) => {
  let req = agent.post(`/api/tests/${id}/questions/upload`);
  if (opts.topic !== undefined) req = req.field("defaultTopic", opts.topic);
  return req.attach("questions", Buffer.isBuffer(csv) ? csv : Buffer.from(csv), {
    filename: "questions.csv",
    contentType: opts.mime ?? "text/csv",
  });
};

const CSV =
  "question,A,B,C,D,correct,topic\n" +
  "Which layer routes packets?,Physical,Network,Application,Session,B,Networking\n" +
  "What resolves names?,DNS,FTP,SMTP,SSH,A,\n" +
  "Which is a database?,Redis,Router,Switch,Modem,A,Databases\n" +
  "Existing question?,a,b,c,d,A,Networking\n";

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  other = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Uploader", email: "uploader@example.com", password: PASSWORD })
    .expect(201);
  await other
    .post("/api/auth/lecturer/register")
    .send({ name: "Outsider", email: "outsider-up@example.com", password: PASSWORD })
    .expect(201);
}, 120_000);

afterAll(stopDb);

describe("question file upload", () => {
  it("adds valid rows as pending questions with the right keys, skipping duplicates", async () => {
    const id = await newTest();
    await lecturer
      .post(`/api/tests/${id}/questions/manual`)
      .send({ text: "Existing question?", options: ["a", "b"], correctOptionIndex: 0, topic: "Networking" })
      .expect(201);

    const res = await upload(lecturer, id, CSV, { topic: "Networking" }).expect(200);
    expect(res.body).toMatchObject({ acceptedCount: 3, rejectedCount: 1 });
    expect(res.body.rejectedReasons[0]).toMatch(/Row 5: duplicate/);

    const pending = await lecturer.get(`/api/tests/${id}/questions?status=pending`).expect(200);
    expect(pending.body.total).toBe(3);
    const routes = pending.body.questions.find((q: any) => q.text.startsWith("Which layer"));
    expect(routes).toMatchObject({ correctOptionIndex: 1, approved: false, topic: "Networking" });
    expect(routes.options).toEqual(["Physical", "Network", "Application", "Session"]);
  });

  it("uses the chosen default topic, or the test's first topic when none is sent", async () => {
    const a = await newTest();
    await upload(lecturer, a, CSV, { topic: "Databases" }).expect(200);
    const topicsA = (await lecturer.get(`/api/tests/${a}/questions`)).body.summary.topics;
    expect(topicsA).toEqual([
      { topic: "Databases", count: 2 }, // the blank-topic row + the explicit Databases row
      { topic: "Networking", count: 2 },
    ]);

    const b = await newTest();
    await upload(lecturer, b, CSV).expect(200);
    const topicsB = (await lecturer.get(`/api/tests/${b}/questions`)).body.summary.topics;
    expect(topicsB.find((t: any) => t.topic === "Networking").count).toBe(3); // first topic is Networking
  });

  it("rejects missing files, wrong file types and oversized files", async () => {
    const id = await newTest();
    await lecturer.post(`/api/tests/${id}/questions/upload`).expect(400);
    await upload(lecturer, id, "%PDF-1.4", { mime: "application/pdf" }).expect(400);
    await upload(lecturer, id, Buffer.alloc(1024 * 1024 + 10, "a")).expect(400);
  });

  it("is not available to another lecturer, or once the test is published", async () => {
    const id = await newTest();
    expect((await upload(other, id, CSV)).status).toBe(404);

    await Test.updateOne({ _id: id }, { $set: { status: "published" } });
    expect((await upload(lecturer, id, CSV)).status).toBe(400);
    expect(await Question.countDocuments({ testId: id })).toBe(0);
  });

  it("refuses a file that would take the test past the question cap", async () => {
    const id = await newTest();
    await Question.insertMany(
      Array.from({ length: 499 }, (_, i) => ({
        testId: id,
        text: `Filler ${i}?`,
        options: ["a", "b"],
        correctOptionIndex: 0,
        topic: "Networking",
        approved: true,
      }))
    );

    const res = await upload(lecturer, id, CSV);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/over 500/);
    expect(await Question.countDocuments({ testId: id })).toBe(499);
  });
});