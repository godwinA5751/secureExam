
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { requireLecturer, requireStudent } from "../src/middleware/auth";
import {
  signLecturerToken,
  signStudentToken,
  verifyLecturerToken,
  verifyStudentToken,
} from "../src/utils/jwt";
import { revokeToken } from "../src/services/sessions";
import { RevokedToken } from "../src/models/RevokedToken";
import { User } from "../src/models/User";
import { startDb, stopDb, clearDb } from "./helpers/db";

const SUB = "507f1f77bcf86cd799439011";

beforeAll(async () => {
  process.env.JWT_LECTURER_SECRET = "l".repeat(32);
  process.env.JWT_STUDENT_SECRET = "s".repeat(32);
  await startDb();
});

afterAll(stopDb);
afterEach(clearDb);

const app = express();

app.get("/lecturer", requireLecturer, (_req, res) =>
  res.json({ ok: true })
);

app.get("/student/:linkToken", requireStudent, (_req, res) =>
  res.json({ ok: true })
);

const bearer = (t: string) => ({
  Authorization: `Bearer ${t}`,
});

async function createLecturer() {
  await User.create({
    _id: SUB,
    role: "lecturer",
    name: "Test Lecturer",
    email: "test@example.com",
    authVersion: 0,
  });
}

describe("session revocation", () => {
  it("accepts a fresh lecturer token", async () => {
    await createLecturer();

    const t = signLecturerToken({
      sub: SUB,
      role: "lecturer",
      authVersion: 0,
    });

    const res = await request(app)
      .get("/lecturer")
      .set(bearer(t));

    expect(res.status).toBe(200);
  });

  it("rejects a token after it is revoked, while the same user's other session keeps working", async () => {
    await createLecturer();

    const first = signLecturerToken({
      sub: SUB,
      role: "lecturer",
      authVersion: 0,
    });

    const second = signLecturerToken({
      sub: SUB,
      role: "lecturer",
      authVersion: 0,
    });

    await revokeToken(verifyLecturerToken(first));

    expect(
      (await request(app).get("/lecturer").set(bearer(first))).status
    ).toBe(401);

    expect(
      (await request(app).get("/lecturer").set(bearer(second))).status
    ).toBe(200);
  });

  it("still accepts older tokens that carry no id (they just expire on schedule)", async () => {
    await createLecturer();

    const old = jwt.sign(
      {
        sub: SUB,
        role: "lecturer",
      },
      "l".repeat(32),
      {
        expiresIn: "1h",
        issuer: "secureexam",
        audience: "secureexam-lecturer",
      }
    );

    expect(
      (await request(app).get("/lecturer").set(bearer(old))).status
    ).toBe(200);
  });

  it("revokes student tokens too", async () => {
    const t = signStudentToken(
      {
        sub: SUB,
        role: "student",
        testId: "t1",
        linkToken: "abc",
      },
      3600
    );

    expect(
      (await request(app).get("/student/abc").set(bearer(t))).status
    ).toBe(200);

    await revokeToken(verifyStudentToken(t));

    expect(
      (await request(app).get("/student/abc").set(bearer(t))).status
    ).toBe(401);
  });

  it("stores the token's own expiry so the denylist cleans itself up", async () => {
    await createLecturer();

    const t = signLecturerToken({
      sub: SUB,
      role: "lecturer",
      authVersion: 0,
    });

    const payload = verifyLecturerToken(t);

    await revokeToken(payload);

    const doc = await RevokedToken.findOne({
      jti: payload.jti,
    }).lean();

    expect(doc!.expiresAt.getTime()).toBe(payload.exp! * 1000);
  });

  it("is harmless to revoke the same token twice at once", async () => {
    const payload = verifyLecturerToken(
      signLecturerToken({
        sub: SUB,
        role: "lecturer",
        authVersion: 0,
      })
    );

    await Promise.all([
      revokeToken(payload),
      revokeToken(payload),
    ]);

    expect(
      await RevokedToken.countDocuments({
        jti: payload.jti,
      })
    ).toBe(1);
  });
});
