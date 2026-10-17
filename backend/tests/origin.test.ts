import express from "express";
import request from "supertest";
import { describe, it, expect, beforeAll } from "vitest";
import { requireTrustedOrigin } from "../src/middleware/originCheck";

beforeAll(() => {
  process.env.CORS_ORIGINS = "https://app.example.com/, http://localhost:3000";
});

function makeApp() {
  const app = express();
  app.use(requireTrustedOrigin);
  app.get("/x", (_req, res) => res.json({ ok: true }));
  app.post("/x", (_req, res) => res.json({ ok: true }));
  app.delete("/x", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireTrustedOrigin", () => {
  const app = makeApp();

  it("lets GET through from any origin", async () => {
    const res = await request(app).get("/x").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
  });

  it("allows a POST from a configured origin (trailing slash in config is fine)", async () => {
    const res = await request(app).post("/x").set("Origin", "https://app.example.com");
    expect(res.status).toBe(200);
  });

  it("blocks a POST from another site", async () => {
    const res = await request(app).post("/x").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("blocks a DELETE from another site", async () => {
    const res = await request(app).delete("/x").set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it('blocks Origin: "null"', async () => {
    const res = await request(app).post("/x").set("Origin", "null");
    expect(res.status).toBe(403);
  });

  it("allows a POST with no Origin or Referer (curl, cron)", async () => {
    const res = await request(app).post("/x");
    expect(res.status).toBe(200);
  });

  it("falls back to the Referer when Origin is missing", async () => {
    const bad = await request(app).post("/x").set("Referer", "https://evil.example/page");
    const good = await request(app).post("/x").set("Referer", "https://app.example.com/page");
    expect(bad.status).toBe(403);
    expect(good.status).toBe(200);
  });
});