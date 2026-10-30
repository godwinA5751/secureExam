import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app";
import { Test } from "../src/models/Test";
import { startDb, stopDb } from "./helpers/db";

const PASSWORD = "correct-horse-battery";
const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

let lecturer: ReturnType<typeof request.agent>;
let testId: string;

const state = async () => {
  const res = await lecturer.get("/api/tests").expect(200);
  return res.body.tests.find((t: any) => String(t.id) === testId);
};

beforeAll(async () => {
  await startDb();
  lecturer = request.agent(app);
  await lecturer
    .post("/api/auth/lecturer/register")
    .send({ name: "Windows", email: "windows@example.com", password: PASSWORD })
    .expect(201);
  const created = await lecturer
    .post("/api/tests")
    .send({
      title: "Window states",
      loginWindowStart: hours(-1).toISOString(),
      loginWindowEnd: hours(1).toISOString(),
      durationMinutes: 30,
    })
    .expect(201);
  testId = created.body.test.id;
}, 120_000);

afterAll(stopDb);

describe("test list window state", () => {
  it("shows a new test as a draft", async () => {
    expect((await state()).windowState).toBe("draft");
  });

  it("shows a published test as scheduled until its start time", async () => {
    await Test.updateOne(
      { _id: testId },
      { $set: { status: "published", window: "opened", loginWindowStart: hours(2), loginWindowEnd: hours(5) } }
    );
    const t = await state();
    expect(t.windowState).toBe("scheduled");
    expect(t.window).toBe("opened"); // the stored flag alone would have said it was already open
    expect(new Date(t.loginWindowStart).getTime()).toBeGreaterThan(Date.now());
  });

  it("shows it as open inside the window", async () => {
    await Test.updateOne({ _id: testId }, { $set: { loginWindowStart: hours(-1), loginWindowEnd: hours(1) } });
    expect((await state()).windowState).toBe("open");
  });

  it("shows it as closed the moment the end passes, without waiting for the background job", async () => {
    await Test.updateOne({ _id: testId }, { $set: { loginWindowStart: hours(-3), loginWindowEnd: hours(-1) } });
    const t = await state();
    expect(t.windowState).toBe("closed");
    expect(t.window).toBe("opened"); // the stored flag is stale until the 5-minute job runs
  });

  it("stores a scheduled published test as closed until its start time", async () => {
    await Test.updateOne(
      { _id: testId },
      {
        $set: {
          status: "published",
          window: "closed",
          loginWindowStart: hours(2),
          loginWindowEnd: hours(5),
        },
      }
    );

    const test = await Test.findById(testId);

    expect(test?.window).toBe("closed");
    expect((await state()).windowState).toBe("scheduled");
  });

  it("does not reopen a published test whose login window has ended", async () => {
    await Test.updateOne(
      { _id: testId },
      {
        $set: {
          status: "published",
          window: "closed",
          loginWindowStart: hours(-5),
          loginWindowEnd: hours(-2),
        },
      }
    );

    const test = await Test.findById(testId);

    expect(test?.window).toBe("closed");
    expect((await state()).windowState).toBe("closed");
  });
});