import jwt from "jsonwebtoken";

export type LecturerTokenPayload = { sub: string; role: "lecturer" };
export type StudentTokenPayload = {
  sub: string;
  role: "student";
  testId: string;
  linkToken: string;
};

function requireSecret(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 16) {
    throw new Error(`${name} must be set to a long random value (see .env.example)`);
  }
  return v;
}

export function signLecturerToken(payload: LecturerTokenPayload): string {
  return jwt.sign(payload, requireSecret("JWT_LECTURER_SECRET"), {
    expiresIn: "12h",
    issuer: "secureexam",
    audience: "secureexam-lecturer",
  });
}

export function verifyLecturerToken(token: string): LecturerTokenPayload {
  return jwt.verify(token, requireSecret("JWT_LECTURER_SECRET"), {
    issuer: "secureexam",
    audience: "secureexam-lecturer",
  }) as LecturerTokenPayload;
}

/**
 * Student tokens are scoped to a single test + linkToken and expire no later
 * than the test's login window close, so a leaked token has bounded value.
 */
export function signStudentToken(payload: StudentTokenPayload, expiresInSeconds: number): string {
  return jwt.sign(payload, requireSecret("JWT_STUDENT_SECRET"), {
    expiresIn: expiresInSeconds,
    issuer: "secureexam",
    audience: "secureexam-student",
  });
}

export function verifyStudentToken(token: string): StudentTokenPayload {
  return jwt.verify(token, requireSecret("JWT_STUDENT_SECRET"), {
    issuer: "secureexam",
    audience: "secureexam-student",
  }) as StudentTokenPayload;
}
