import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../src/services/llmService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/llmService")>();
  return { ...actual, generateQuestionsFromText: vi.fn(), extractQuestionsFromText: vi.fn() };
});

import app from "../src/app";
import * as llm from "../src/services/llmService";
import { Question } from "../src/models/Question";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";
const TEXT = "Course material about networks and databases. ".repeat(10);

const gen = vi.mocked(llm.generateQuestionsFromText);
const ext = vi.mocked(llm.extractQuestionsFromText);
const mk = (n: number, topic = "Networking") => ({
  text: `Generated question ${n}?`,
  options: ["a", "b", "c", "d"],
  correctOptionIndex: n % 4,
  topic,
});

let lecturer: Agent;
let other: Agent;
let testId: string;

async function newTest(): Promise<string> {
  const res = await lecturer
    .post("/api/tests")
    .send({
      title: "From text",
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  return res.body.test.id;
}

const post = (body: object, agent: Agent = lecturer, id: string = testId) =>
  agent.post(`/api/tests/${id}/generate-from-text`).send(body);

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  other = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Texter", email: "texter@example.com", password: PASSWORD })
    .expect(201);
  await other
    .post("/api/auth/lecturer/register")
    .send({ name: "Outsider", email: "outsider-text@example.com", password: PASSWORD })
    .expect(201);
  testId = await newTest();
}, 120_000);

afterAll(stopDb);

beforeEach(() => {
  gen.mockReset();
  ext.mockReset();
});

describe("generate-from-text", () => {
  it("adds generated questions as pending, with the topic snapped to the test's spelling", async () => {
    // The test already has a "Networking" question, so "networking" must reuse that spelling.
    await lecturer
      .post(`/api/tests/${testId}/questions/manual`)
      .send({ text: "Seed question?", options: ["a", "b"], correctOptionIndex: 0, topic: "Networking" })
      .expect(201);
    gen.mockResolvedValue([mk(1), mk(2), mk(3)]);

    const res = await post({ mode: "generate", text: TEXT, topic: "networking", count: 3 }).expect(201);

    expect(res.body).toMatchObject({ added: 3, duplicatesSkipped: 0, withoutAnswer: 0 });
    expect(gen).toHaveBeenCalledWith(TEXT, "Networking", 3);
    const list = await lecturer.get(`/api/tests/${testId}/questions?status=pending`).expect(200);
    expect(list.body.total).toBe(3);
  });

  it("skips duplicates of existing questions and within the same batch", async () => {
    gen.mockResolvedValue([mk(1), mk(1), mk(4)]);

    const res = await post({ mode: "generate", text: TEXT, topic: "Networking", count: 3 }).expect(201);

    expect(res.body).toMatchObject({ added: 1, duplicatesSkipped: 2 });
  });

  it("copies existing questions and reports the ones without a marked answer", async () => {
    ext.mockResolvedValue({ questions: [mk(10), mk(11)], found: 3 });

    const res = await post({ mode: "extract", text: TEXT, topic: "Databases" }).expect(201);

    expect(res.body).toMatchObject({ mode: "extract", added: 2, withoutAnswer: 1 });
    expect(gen).not.toHaveBeenCalled();
  });

  it("rejects bad requests without calling the AI", async () => {
    expect((await post({ mode: "generate", text: "short", topic: "Networking", count: 3 })).status).toBe(400);
    expect((await post({ mode: "generate", text: TEXT, topic: "Networking" })).status).toBe(400); // no count
    expect((await post({ mode: "generate", text: TEXT, topic: "Networking", count: 16 })).status).toBe(400);
    expect((await post({ mode: "generate", text: TEXT, topic: "  ", count: 3 })).status).toBe(400);
    expect((await post({ mode: "bogus", text: TEXT, topic: "Networking", count: 3 })).status).toBe(400);
    expect(gen).not.toHaveBeenCalled();
    expect(ext).not.toHaveBeenCalled();
  });

  it("hides provider errors from the lecturer and saves nothing", async () => {
    gen.mockRejectedValue(new Error("secret provider detail"));
    const before = await Question.countDocuments({ testId });

    const res = await post({ mode: "generate", text: TEXT, topic: "Networking", count: 3 });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret");
    expect(await Question.countDocuments({ testId })).toBe(before);
  });

  it("is not available to another lecturer or on a published test", async () => {
    expect((await post({ mode: "generate", text: TEXT, topic: "Networking", count: 3 }, other)).status).toBe(404);

    const published = await newTest();
    await Test.updateOne({ _id: published }, { $set: { status: "published" } });
    expect(
      (await post({ mode: "generate", text: TEXT, topic: "Networking", count: 3 }, lecturer, published)).status
    ).toBe(400);
    expect(gen).not.toHaveBeenCalled();
  });

  it("stops at the per-test question cap", async () => {
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
    gen.mockResolvedValue([mk(900), mk(901)]);

    const first = await post({ mode: "generate", text: TEXT, topic: "Networking", count: 2 }, lecturer, id).expect(201);
    expect(first.body.added).toBe(1); // only one place left
    expect(
      (await post({ mode: "generate", text: TEXT, topic: "Networking", count: 2 }, lecturer, id)).status
    ).toBe(400);
    expect(await Question.countDocuments({ testId: id })).toBe(500);
  });
});