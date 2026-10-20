import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Question } from "../src/models/Question";
import { Attempt } from "../src/models/Attempt";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;

const PASSWORD = "correct-horse-battery";
const REGISTER = "/api/auth/lecturer/register";
const LOGIN = "/api/auth/lecturer/login";
const ME = "/api/auth/lecturer/me";

const QUESTIONS = [
  { text: "Which layer routes packets?", options: ["Physical", "Network", "Application", "Session"], correctOptionIndex: 1, topic: "Networking" },
  { text: "Which protocol resolves names?", options: ["DNS", "FTP", "SMTP", "SSH"], correctOptionIndex: 0, topic: "Networking" },
  { text: "Which port is HTTPS?", options: ["80", "22", "443", "25"], correctOptionIndex: 2, topic: "Networking" },
];
const correctTextByQuestion = new Map(QUESTIONS.map((q) => [q.text, q.options[q.correctOptionIndex]]));

type Exam = { id: string; linkToken: string; accessCode: string };

// ---------- helpers ----------

function lecturerCookie(res: any): string {
  const cookies = (res.headers["set-cookie"] ?? []) as string[];
  const cookie = cookies.find((c) => c.startsWith("secureExamLecturer="));
  if (!cookie) throw new Error("no lecturer cookie in response");
  return cookie;
}
const tokenFrom = (cookie: string) => decodeURIComponent(cookie.split(";")[0].split("=")[1]);

async function registerLecturer(email: string, name = "Test Lecturer"): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post(REGISTER).send({ name, email, password: PASSWORD }).expect(201);
  return agent;
}

async function createTest(agent: Agent): Promise<Exam> {
  const res = await agent
    .post("/api/tests")
    .send({
      title: "Networks midterm",
      topics: ["Networking"],
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
      questionGenMode: "manual",
    })
    .expect(201);
  return { id: res.body.test.id, linkToken: res.body.test.linkToken, accessCode: res.body.accessCode };
}

async function buildPublishedExam(agent: Agent, studentIds: string[], questions = QUESTIONS): Promise<Exam> {
  const exam = await createTest(agent);
  for (const q of questions) {
    await agent.post(`/api/tests/${exam.id}/questions/manual`).send(q).expect(201);
  }
  await agent
    .post(`/api/tests/${exam.id}/roster`)
    .attach("roster", Buffer.from(studentIds.join("\n") + "\n"), { filename: "roster.csv", contentType: "text/csv" })
    .expect(200);
  await agent.post(`/api/tests/${exam.id}/link`).expect(200);
  return exam;
}

async function loginStudent(exam: Exam, idNumber: string): Promise<Agent> {
  const agent = request.agent(app);
  await agent
    .post("/api/auth/student/login")
    .send({ linkToken: exam.linkToken, idNumber, accessCode: exam.accessCode })
    .expect(200);
  return agent;
}

// ---------- shared fixtures ----------

let lecturerA: Agent;
let lecturerB: Agent;
let exam: Exam; // published by lecturer A; students CSC/001..003

beforeAll(async () => {
  await startDb();
  lecturerA = await registerLecturer("lecturer.a@example.com", "Lecturer A");
  lecturerB = await registerLecturer("lecturer.b@example.com", "Lecturer B");
  exam = await buildPublishedExam(lecturerA, ["CSC/001", "CSC/002", "CSC/003"]);
}, 120_000);

afterAll(stopDb);

// ---------- lecturer accounts and cookies ----------

describe("lecturer accounts and cookies", () => {
  it("register sets an httpOnly cookie, and /me works without exposing secrets", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post(REGISTER)
      .send({ name: "Cookie Tester", email: "cookie@example.com", password: PASSWORD })
      .expect(201);

    const cookie = lecturerCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\//);

    const me = await agent.get(ME).expect(200);
    expect(me.body.email).toBe("cookie@example.com");
    expect(JSON.stringify(me.body)).not.toMatch(/password/i);
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post(REGISTER)
      .send({ name: "Cookie Again", email: "cookie@example.com", password: PASSWORD })
      .expect(409);
  });

  it("rejects a weak password", async () => {
    await request(app)
      .post(REGISTER)
      .send({ name: "Weak Pass", email: "weak@example.com", password: "short" })
      .expect(400);
  });

  it("answers an unknown email and a wrong password identically (no account enumeration)", async () => {
    const unknown = await request(app).post(LOGIN).send({ email: "nobody@example.com", password: PASSWORD });
    const wrong = await request(app).post(LOGIN).send({ email: "cookie@example.com", password: "not-the-password" });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("locks the account after repeated wrong passwords, even for the right one", async () => {
    await request(app).post(REGISTER).send({ name: "Lock Me", email: "lock@example.com", password: PASSWORD }).expect(201);

    for (let i = 0; i < 5; i++) {
      await request(app).post(LOGIN).send({ email: "lock@example.com", password: "wrong-password-1" }).expect(401);
    }
    await request(app).post(LOGIN).send({ email: "lock@example.com", password: PASSWORD }).expect(423);
  });

  it("logout clears the cookie and a copied token stops working", async () => {
    // Uses the account created in the first test of this group.
    const agent = request.agent(app);
    const login = await agent.post(LOGIN).send({ email: "cookie@example.com", password: PASSWORD }).expect(200);
    const copied = tokenFrom(lecturerCookie(login));

    await request(app).get(ME).set("Authorization", `Bearer ${copied}`).expect(200);

    const out = await agent.post("/api/auth/logout").expect(200);
    const cleared = (out.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("secureExamLecturer="))!;
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    await agent.get(ME).expect(401);
    await request(app).get(ME).set("Authorization", `Bearer ${copied}`).expect(401);
  });
});

// ---------- student login ----------

describe("student login", () => {
  const login = (body: object) => request(app).post("/api/auth/student/login").send(body);

  it("refuses an ID that is not on the roster", async () => {
    const res = await login({ linkToken: exam.linkToken, idNumber: "CSC/999", accessCode: exam.accessCode });
    expect(res.status).toBe(403);
  });

  it("refuses a wrong access code", async () => {
    const res = await login({ linkToken: exam.linkToken, idNumber: "CSC/003", accessCode: "000000" });
    expect(res.status).toBe(401);
  });

  it("refuses a missing access code", async () => {
    const res = await login({ linkToken: exam.linkToken, idNumber: "CSC/003" });
    expect(res.status).toBe(401);
  });
});

// ---------- access control ----------

describe("access control", () => {
  it("requires a lecturer session for lecturer routes", async () => {
    await request(app).get("/api/tests").expect(401);
  });

  it("answers a malformed test id with a clean 400", async () => {
    await lecturerA.get("/api/tests/abc/questions").expect(400);
  });

  it("hides one lecturer's test from another lecturer on every route (404, never 403)", async () => {
    const calls = [
      () => lecturerB.get(`/api/tests/${exam.id}/questions`),
      () => lecturerB.get(`/api/tests/${exam.id}/results`),
      () => lecturerB.get(`/api/tests/${exam.id}/export`),
      () => lecturerB.post(`/api/tests/${exam.id}/link`),
      () => lecturerB.post(`/api/tests/${exam.id}/access-code/regenerate`),
      () => lecturerB.post(`/api/tests/${exam.id}/questions/manual`).send(QUESTIONS[0]),
      () => lecturerB.delete(`/api/tests/${exam.id}`),
    ];
    for (const call of calls) {
      expect((await call()).status).toBe(404);
    }

    const theirs = await lecturerB.get("/api/tests").expect(200);
    expect(theirs.body.tests.some((t: any) => String(t.id) === exam.id)).toBe(false);

    const mine = await lecturerA.get("/api/tests").expect(200);
    expect(mine.body.tests.some((t: any) => String(t.id) === exam.id)).toBe(true);
  });

  it("blocks a forged cross-site POST even when the session cookie is sent", async () => {
    const body = {
      title: "Forged request test",
      topics: ["x"],
      loginWindowStart: new Date().toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 10,
      questionGenMode: "manual",
    };
    const forged = await lecturerA.post("/api/tests").set("Origin", "https://evil.example").send(body);
    expect(forged.status).toBe(403);
    expect(await Test.countDocuments({ title: "Forged request test" })).toBe(0);

    // From the real frontend origin the same route gets past the check (empty body: validation error).
    const real = await lecturerA.post("/api/tests").set("Origin", "http://localhost:3000").send({});
    expect(real.status).toBe(400);
  });
});

// ---------- answer-key secrecy ----------

describe("answer-key secrecy", () => {
  it("never sends the answer key or the internal option map to a student", async () => {
    const s = await loginStudent(exam, "CSC/002");
    await s.post(`/api/attempts/${exam.linkToken}/start`).expect(200);

    const res = await s.get(`/api/attempts/${exam.linkToken}/questions`).expect(200);
    expect(res.body.questions).toHaveLength(3);
    expect(JSON.stringify(res.body)).not.toContain("correctOptionIndex");
    expect(JSON.stringify(res.body)).not.toContain("optionOrder");
    for (const q of res.body.questions) {
      expect(q).not.toHaveProperty("correctOptionIndex");
      expect(q).not.toHaveProperty("optionOrder");
    }

    const saved = await s
      .post(`/api/attempts/${exam.linkToken}/answer`)
      .send({ questionId: res.body.questions[0].id, selectedOptionIndex: 0 })
      .expect(200);
    expect(saved.body).toEqual({ ok: true });
  });

  it("does not let a student session reach lecturer routes", async () => {
    const s = await loginStudent(exam, "CSC/003");
    await s.get(`/api/tests/${exam.id}/questions`).expect(401);
    await s.get("/api/tests").expect(401);
  });

  it("does not accept a student's session for a different test link", async () => {
    const other = await buildPublishedExam(lecturerA, ["CSC/009"], [QUESTIONS[0]]);
    const s = await loginStudent(exam, "CSC/001");

    const res = await s.post(`/api/attempts/${other.linkToken}/start`);
    expect(res.status).toBe(403);
  });
});

// ---------- published tests are frozen ----------

describe("published tests are frozen", () => {
  it("refuses to add, generate or approve questions after publishing", async () => {
    const add = await lecturerA.post(`/api/tests/${exam.id}/questions/manual`).send(QUESTIONS[0]);
    expect(add.status).toBe(400);
    expect(JSON.stringify(add.body)).toMatch(/published/i);

    const generate = await lecturerA.post(`/api/tests/${exam.id}/generate-questions`).send({});
    expect(generate.status).toBe(400);

    const review = await lecturerA
      .patch(`/api/tests/${exam.id}/questions`)
      .send({ approvedQuestionIds: ["64b7f0c2a1b2c3d4e5f60718"] });
    expect(review.status).toBe(400);

    expect(await Question.countDocuments({ testId: exam.id })).toBe(3);
  });
});

// ---------- full exam flow ----------

describe("exam flow", () => {
  it("scores correctly end to end with shuffled options (2 of 3)", async () => {
    const s = await loginStudent(exam, "CSC/001");
    await s.post(`/api/attempts/${exam.linkToken}/start`).expect(200);
    const qs = (await s.get(`/api/attempts/${exam.linkToken}/questions`).expect(200)).body.questions;

    for (let i = 0; i < qs.length; i++) {
      const correctText = correctTextByQuestion.get(qs[i].text)!;
      const index =
        i < 2
          ? qs[i].options.indexOf(correctText) // answer the first two correctly
          : qs[i].options.findIndex((o: string) => o !== correctText); // get the last one wrong
      await s
        .post(`/api/attempts/${exam.linkToken}/answer`)
        .send({ questionId: qs[i].id, selectedOptionIndex: index })
        .expect(200);
    }

    const submit = await s.post(`/api/attempts/${exam.linkToken}/submit`).expect(200);
    expect(submit.body).toMatchObject({ score: 2, total: 3 });

    const result = await s.get(`/api/attempts/${exam.linkToken}/result`).expect(200);
    expect(result.body).toMatchObject({ score: 2, total: 3 });

    // A second submit is refused, and answers can no longer change.
    await s.post(`/api/attempts/${exam.linkToken}/submit`).expect(403);
    await s
      .post(`/api/attempts/${exam.linkToken}/answer`)
      .send({ questionId: qs[0].id, selectedOptionIndex: 0 })
      .expect(403);

    // The lecturer sees the same result.
    const results = await lecturerA.get(`/api/tests/${exam.id}/results`).expect(200);
    const row = results.body.results.find((r: any) => r.idNumber === "CSC/001");
    expect(row).toMatchObject({ score: 2, total: 3 });
  });

  it("blocks deleting a test mid-exam, then deletes everything once it is over", async () => {
    const t = await buildPublishedExam(lecturerA, ["CSC/021"], [QUESTIONS[0]]);
    const s = await loginStudent(t, "CSC/021");
    await s.post(`/api/attempts/${t.linkToken}/start`).expect(200);

    const blocked = await lecturerA.delete(`/api/tests/${t.id}`);
    expect(blocked.status).toBe(409);
    expect(await Test.countDocuments({ _id: t.id })).toBe(1);

    await s.post(`/api/attempts/${t.linkToken}/submit`).expect(200);
    await lecturerA.delete(`/api/tests/${t.id}`).expect(200);

    expect(await Test.countDocuments({ _id: t.id })).toBe(0);
    expect(await Question.countDocuments({ testId: t.id })).toBe(0);
    expect(await Attempt.countDocuments({ testId: t.id })).toBe(0);
  });
});