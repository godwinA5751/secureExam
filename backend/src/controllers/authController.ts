import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { Test } from "../models/Test";
import { AuthedRequest } from "../middleware/auth";
import { signLecturerToken, signStudentToken } from "../utils/jwt";

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
  const token = signLecturerToken({ sub: user._id.toString(), role: "lecturer" });
  return res.status(201).json({ token });
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

  const token = signLecturerToken({ sub: user._id.toString(), role: "lecturer" });
  return res.json({ token });
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

  // Second-factor access code, hashed at rest, with test + student
  // specific brute-force protection.
  if (test.requiresAccessCode) {
    if (!accessCode || !test.accessCodeHash) {
      return res.status(401).json({ error: "Access code required" });
    }

    const now = new Date();

    let loginAttempt = test.studentLoginAttempts.find(
      (attempt) => attempt.idNumber === idNumber
    );

    if (loginAttempt?.lockedUntil && loginAttempt.lockedUntil > now) {
      return res.status(423).json({
        error: "Too many failed attempts. Try again later.",
      });
    }

    // Clear an expired lock.
    if (loginAttempt?.lockedUntil && loginAttempt.lockedUntil <= now) {
      loginAttempt.failedAttempts = 0;
      loginAttempt.lockedUntil = null;
    }

    const codeValid = await bcrypt.compare(
      accessCode,
      test.accessCodeHash
    );

    if (!codeValid) {
      if (!loginAttempt) {
        test.studentLoginAttempts.push({
          idNumber,
          failedAttempts: 1,
          lockedUntil: null,
        });
      } else {
        loginAttempt.failedAttempts += 1;

        if (loginAttempt.failedAttempts >= LOCKOUT_THRESHOLD) {
          loginAttempt.failedAttempts = 0;
          loginAttempt.lockedUntil = new Date(
            Date.now() + LOCKOUT_MINUTES * 60 * 1000
          );
        }
      }

      await test.save();

      const updatedAttempt = test.studentLoginAttempts.find(
        (attempt) => attempt.idNumber === idNumber
      );

      if (updatedAttempt?.lockedUntil) {
        return res.status(423).json({
          error: "Too many failed attempts. Try again later.",
        });
      }

      return res.status(401).json({
        error: "Invalid access code",
      });
    }

    // Successful access-code verification resets the student's
    // failed-attempt counter for this test.
    if (loginAttempt) {
      loginAttempt.failedAttempts = 0;
      loginAttempt.lockedUntil = null;
      await test.save();
    }
  }

  let student = await User.findOne({ role: "student", idNumber });
  if (!student) {
    // Roster upload implicitly provisions the student account (documented v1.0 behavior).
    student = await User.create({ role: "student", idNumber, name: idNumber });
  } else if (student.lockedUntil && student.lockedUntil > now) {
    return res.status(423).json({ error: "Too many failed attempts. Try again later." });
  }

  const secondsUntilWindowClose = Math.max(
    1,
    Math.floor((test.loginWindowEnd.getTime() - now.getTime()) / 1000)
  );
  const token = signStudentToken(
    { sub: student._id.toString(), role: "student", testId: test._id.toString(), linkToken },
    secondsUntilWindowClose
  );
  return res.json({ token, testId: test._id, durationMinutes: test.durationMinutes });
}
