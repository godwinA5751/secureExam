import { Request, Response, NextFunction } from "express";
import { verifyLecturerToken, verifyStudentToken } from "../utils/jwt";
import { isRevoked } from "../services/sessions";
import {
  getCookie,
  LECTURER_COOKIE,
  STUDENT_COOKIE,
} from "../utils/authCookies";

export interface AuthedRequest extends Request {
  lecturer?: { id: string };
  student?: { id: string; testId: string; linkToken: string };
}

export function extractToken(
  req: Request,
  cookieName: string
): string | null {
  const cookieToken = getCookie(req, cookieName);

  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim() || null;
}

export async function requireLecturer(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req, LECTURER_COOKIE);
  if (!token) return res.status(401).json({ error: "Missing lecturer token" });

  let payload;
  try {
    payload = verifyLecturerToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired lecturer token" });
  }

  try {
    if (await isRevoked(payload.jti)) {
      return res.status(401).json({ error: "Session ended. Please log in again." });
    }
  } catch (e) {
    return next(e); // can't confirm the session is still valid: fail the request
  }

  req.lecturer = { id: payload.sub };
  next();
}

/**
 * Verifies the student's JWT AND that its embedded linkToken matches the
 * route's :linkToken param, so a token issued for one test/link cannot be
 * replayed against another.
 */
export async function requireStudent(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req, STUDENT_COOKIE);
  if (!token) return res.status(401).json({ error: "Missing student token" });

  let payload;
  try {
    payload = verifyStudentToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired student token" });
  }

  const routeLinkToken = req.params.linkToken;
  if (routeLinkToken && payload.linkToken !== routeLinkToken) {
    return res.status(403).json({ error: "Token not valid for this test link" });
  }

  try {
    if (await isRevoked(payload.jti)) {
      return res.status(401).json({ error: "Session ended. Please log in again." });
    }
  } catch (e) {
    return next(e);
  }

  req.student = { id: payload.sub, testId: payload.testId, linkToken: payload.linkToken };
  next();
}