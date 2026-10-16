import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { Test } from "../models/Test";
import { AuthedRequest } from "../middleware/auth";
import { signLecturerToken, signStudentToken } from "../utils/jwt";
import {
  setAuthCookie,
  clearAuthCookie,
  LECTURER_COOKIE,
  STUDENT_COOKIE,
} from "../utils/authCookies";
import { LoginThrottle } from "../models/LoginThrottle";

// separate from the lecturer lockout constants
const STUDENT_MAX_FAILS = 5;
const STUDENT_LOCK_MS = 15 * 60 * 1000;
const TOKEN_GRACE_SECONDS = 5 * 60;

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(10).max(128),
});

export async function getLecturerProfile(req: AuthedRequest, res: Response) {
  const user = await User.findById(req.lecturer!.id).select("name email createdAt");
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json({ id: user._id, name: user.name, email: user.email, createdAt: user.createdAt });
}

export async function lecturerRegister(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { name, email, password } = parsed.data;

  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ role: "lecturer", name, email, passwordHash });
  const token = signLecturerToken({
    sub: user._id.toString(),
    role: "lecturer",
  });

  setAuthCookie(res, LECTURER_COOKIE, token, 12 * 60 * 60 * 1000);

  return res.status(201).json({ ok: true });
}

const lecturerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function lecturerLogin(req: Request, res: Response) {
  const parsed = lecturerLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email, password } = parsed.data;

  const user = await User.findOne({ role: "lecturer", email }).select("+passwordHash");
  // Constant-shape response whether or not the account exists, to avoid user enumeration.
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, "$2a$12$invalidsaltinvalidsaltinvalidsal");
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: "Account temporarily locked. Try again later." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    return res.status(401).json({ error: "Invalid credentials" });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  const token = signLecturerToken({
    sub: user._id.toString(),
    role: "lecturer",
  });

  setAuthCookie(res, LECTURER_COOKIE, token, 12 * 60 * 60 * 1000);

  return res.json({ ok: true });
}

const studentLoginSchema = z.object({
  linkToken: z.string().min(10),
  idNumber: z.string().min(4).max(20),
  accessCode: z.string().length(6).optional(),
});

export async function studentLogin(req: Request, res: Response) {
  const parsed = studentLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { linkToken, idNumber, accessCode } = parsed.data;

  const test = await Test.findOne({ linkToken, status: "published" }).select("+accessCodeHash");
  if (!test) return res.status(404).json({ error: "Test link not found" });

  const now = new Date();
  if (now < test.loginWindowStart || now > test.loginWindowEnd) {
    return res.status(403).json({ error: "This test's login window is not currently open" });
  }
  if (!test.allowedStudents.includes(idNumber)) {
    return res.status(403).json({ error: "ID number is not on this test's roster" });
  }

  // Second-factor access code, hashed at rest, with per-test, per-student brute-force protection.
  if (test.requiresAccessCode) {
    // 1. Locked out? Check before the (slow) bcrypt compare.
    const throttle = await LoginThrottle.findOne({ testId: test._id, idNumber }).lean();
    if (throttle?.lockedUntil && throttle.lockedUntil > now) {
      return res.status(423).json({ error: "Too many failed attempts. Try again later." });
    }

    if (!accessCode || !test.accessCodeHash) {
      return res.status(401).json({ error: "Access code required" });
    }

    const codeValid = await bcrypt.compare(accessCode, test.accessCodeHash);

    if (!codeValid) {
      // 2. Record the failure atomically.
      const t = await LoginThrottle.findOneAndUpdate(
        { testId: test._id, idNumber },
        { $inc: { failedAttempts: 1 }, $set: { expireAt: new Date(Date.now() + 24 * 3600 * 1000) } },
        { upsert: true, new: true }
      );

      if (t.failedAttempts >= STUDENT_MAX_FAILS) {
        await LoginThrottle.updateOne(
          { _id: t._id },
          { $set: { lockedUntil: new Date(Date.now() + STUDENT_LOCK_MS), failedAttempts: 0 } }
        );
        return res.status(423).json({ error: "Too many failed attempts. Try again later." });
      }
      return res.status(401).json({ error: "Invalid access code" });
    }

    // 3. Success: clear old failures (only if there were any, to save an op).
    if (throttle) await LoginThrottle.deleteOne({ testId: test._id, idNumber });
  }

  // Find or create the student in one atomic op. This avoids a duplicate-key 500
  // when a new student's first login arrives twice at once.
  const student = await User.findOneAndUpdate(
    { idNumber },
    { $setOnInsert: { role: "student", name: idNumber } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!student) return res.status(500).json({ error: "Login failed" });

  // Token outlives the login window slightly so a final heartbeat or submit at the
  // deadline doesn't 401. Every attempt endpoint still checks the attempt's own
  // deadline and status, and /start still rejects new logins after the window closes.
  const tokenLifetimeSeconds =
    Math.max(1, Math.floor((test.loginWindowEnd.getTime() - now.getTime()) / 1000)) + TOKEN_GRACE_SECONDS;

  const token = signStudentToken(
    { sub: student._id.toString(), role: "student", testId: test._id.toString(), linkToken },
    tokenLifetimeSeconds
  );

  setAuthCookie(res, STUDENT_COOKIE, token, tokenLifetimeSeconds * 1000);

  return res.json({
    testId: test._id,
    durationMinutes: test.durationMinutes,
  });
}

export function logout(req: Request, res: Response) {
  clearAuthCookie(res, LECTURER_COOKIE);
  clearAuthCookie(res, STUDENT_COOKIE);

  return res.json({ message: "Logged out successfully" });
}
