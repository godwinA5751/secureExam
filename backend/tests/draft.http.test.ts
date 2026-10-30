import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";
const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

let lecturer: Agent;
let other: Agent;

async function newTest(start = hours(-1), end = hours(1)): Promise<string> {
  const res = await lecturer
    .post("/api/tests")
    .send({ title: "Draft test", loginWindowStart: start, loginWindowEnd: end, durationMinutes: 30 })
    .expect(201);
  return res.body.test.id;
}

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  other = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Drafter", email: "drafter@example.com", password: PASSWORD })
    .expect(201);
  await other
    .post("/api/auth/lecturer/register")
    .send({ name: "Outsider", email: "outsider-draft@example.com", password: PASSWORD })
    .expect(201);
}, 120_000);

afterAll(stopDb);

describe("reopening a draft", () => {
  it("returns the details needed to continue, to its owner only", async () => {
    const id = await newTest();
    await lecturer
      .post(`/api/tests/${id}/roster`)
      .attach("roster", Buffer.from("DRAFT/001\nDRAFT/002\n"), { filename: "r.csv", contentType: "text/csv" })
      .expect(200);

    const res = await lecturer.get(`/api/tests/${id}`).expect(200);
    expect(res.body.test).toMatchObject({
      id,
      title: "Draft test",
      status: "draft",
      windowState: "draft",
      durationMinutes: 30,
      rosterCount: 2,
      marksPerQuestion: 1,
      questionsPerStudent: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/accessCodeHash|allowedStudents/);

    expect((await other.get(`/api/tests/${id}`)).status).toBe(404);
    expect((await lecturer.get("/api/tests/abc")).status).toBe(400);
  });
});

describe("editing a draft's details", () => {
  it("saves new details", async () => {
    const id = await newTest();
    await lecturer
      .patch(`/api/tests/${id}`)
      .send({
        title: "Renamed test",
        instructions: "Closed book.",
        loginWindowStart: hours(2),
        loginWindowEnd: hours(5),
        durationMinutes: 45,
      })
      .expect(200);

    const { test } = (await lecturer.get(`/api/tests/${id}`).expect(200)).body;
    expect(test).toMatchObject({ title: "Renamed test", instructions: "Closed book.", durationMinutes: 45 });
    expect(new Date(test.loginWindowStart).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects bad details, other lecturers, and published tests", async () => {
    const id = await newTest();
    const good = { title: "Fine title", loginWindowStart: hours(1), loginWindowEnd: hours(2), durationMinutes: 30 };

    expect((await lecturer.patch(`/api/tests/${id}`).send({ ...good, title: "ab" })).status).toBe(400);
    expect(
      (await lecturer.patch(`/api/tests/${id}`).send({ ...good, loginWindowStart: hours(3), loginWindowEnd: hours(2) })).status
    ).toBe(400);
    expect((await other.patch(`/api/tests/${id}`).send(good)).status).toBe(404);

    await Test.updateOne({ _id: id }, { $set: { status: "published" } });
    expect((await lecturer.patch(`/api/tests/${id}`).send(good)).status).toBe(400);
  });
});

describe("publishing a resumed draft", () => {
  it("refuses a login window that has already ended, and works once the dates are fixed", async () => {
    const id = await newTest(hours(-3), hours(-1)); // the dates went stale while the draft sat there
    await lecturer
      .post(`/api/tests/${id}/questions/manual`)
      .send({ text: "A question?", options: ["a", "b"], correctOptionIndex: 0 })
      .expect(201);
    await lecturer
      .post(`/api/tests/${id}/roster`)
      .attach("roster", Buffer.from("DRAFT/010\n"), { filename: "r.csv", contentType: "text/csv" })
      .expect(200);

    const refused = await lecturer.post(`/api/tests/${id}/link`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/already ended/);

    await lecturer
      .patch(`/api/tests/${id}`)
      .send({ title: "Draft test", loginWindowStart: hours(-1), loginWindowEnd: hours(2), durationMinutes: 30 })
      .expect(200);
    await lecturer.post(`/api/tests/${id}/link`).expect(200);

    const { test } = (await lecturer.get(`/api/tests/${id}`).expect(200)).body;
    expect(test).toMatchObject({ status: "published", windowState: "open" });
  });

  it("can make a new access code for a draft, since the first one is shown only once", async () => {
    const id = await newTest();
    const res = await lecturer.post(`/api/tests/${id}/access-code/regenerate`).expect(200);
    expect(typeof res.body.accessCode).toBe("string");
    expect(res.body.accessCode.length).toBeGreaterThan(0);
  });
});