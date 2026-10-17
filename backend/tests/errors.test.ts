import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { asyncHandler } from "../src/utils/asyncHandler";
import { objectIdParam } from "../src/middleware/validateObjectId";
import { errorHandler, notFound } from "../src/middleware/errorHandler";

function makeApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.param("id", objectIdParam);
  router.get("/boom", asyncHandler(async () => {
    throw new Error("secret db detail mongodb://user:pass@host");
  }));
  router.get("/tests/:id", asyncHandler(async (req, res) => {
    res.json({ id: req.params.id });
  }));
  router.post("/echo", asyncHandler(async (req, res) => res.json(req.body)));
  app.use(router);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe("error handling", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  const app = makeApp();

  it("turns a rejected async handler into a sanitized 500", async () => {
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("rejects a malformed id with 400 before the handler runs", async () => {
    const res = await request(app).get("/tests/abc");
    expect(res.status).toBe(400);
  });

  it("accepts a valid ObjectId", async () => {
    const res = await request(app).get("/tests/64b7f0c2a1b2c3d4e5f60718");
    expect(res.status).toBe(200);
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
  });
});