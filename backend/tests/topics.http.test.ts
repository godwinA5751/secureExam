import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../src/services/llmService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/llmService")>();
  return { ...actual, generateQuestionsForTopics: vi.fn() };
});

import app from "../src/app";
import * as llm from "../src/services/llmService";
import { startDb, stopDb } from "./helpers/db";

type Agent = ReturnType<typeof request.agent>;
const PASSWORD = "correct-horse-battery";
const gen = vi.mocked(llm.generateQuestionsForTopics);

let lecturer: Agent;
let testId: string;

const manual = (topic?: string, text = "A question?") =>
  lecturer
    .post(`/api/tests/${testId}/questions/manual`)
    .send({ text, options: ["a", "b"], correctOptionIndex: 0, ...(topic === undefined ? {} : { topic }) });

const generate = (body: object) => lecturer.post(`/api/tests/${testId}/generate-questions`).send(body);

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Topics", email: "topics@example.com", password: PASSWORD })
    .expect(201);

  // No topics field: topics are no longer part of creating a test.
  const res = await lecturer
    .post("/api/tests")
    .send({
      title: "No topics needed",
      loginWindowStart: new Date(Date.now() - 60_000).toISOString(),
      loginWindowEnd: new Date(Date.now() + 3_600_000).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  testId = res.body.test.id;
}, 120_000);

afterAll(stopDb);
beforeEach(() => gen.mockReset());

describe("topics live with the questions", () => {
  it("files a manual question without a topic under General, and reuses existing spellings", async () => {
    await manual("Networking", "Q one?").expect(201);
    await manual("networking", "Q two?").expect(201);
    await manual(undefined, "Q three?").expect(201);

    const list = await lecturer.get(`/api/tests/${testId}/questions`).expect(200);
    expect(list.body.summary.topics).toEqual([
      { topic: "General", count: 1 },
      { topic: "Networking", count: 2 },
    ]);
  });

  it("takes AI topics from the request, reusing existing spellings and dropping repeats", async () => {
    gen.mockResolvedValue([
      { text: "Generated?", options: ["a", "b", "c", "d"], correctOptionIndex: 0, topic: "Networking" },
    ]);

    const res = await generate({ topics: ["networking", "Databases", "DATABASES"], count: 4 }).expect(201);

    expect(res.body).toMatchObject({ count: 1, requested: 4 });
    expect(gen).toHaveBeenCalledWith(["Networking", "Databases"], 4);
  });

  it("asks for 5 questions per topic when no count is given", async () => {
    gen.mockResolvedValue([]);

    await generate({ topics: ["Security", "Cloud"] }).expect(201);

    expect(gen).toHaveBeenCalledWith(["Security", "Cloud"], 10);
  });

  it("requires topics in the request", async () => {
    expect((await generate({})).status).toBe(400);
    expect((await generate({ topics: [] })).status).toBe(400);
    expect((await generate({ topics: ["  "] })).status).toBe(400);
    expect((await generate({ topics: Array.from({ length: 21 }, (_, i) => `T${i}`) })).status).toBe(400);
    expect(gen).not.toHaveBeenCalled();
  });
});