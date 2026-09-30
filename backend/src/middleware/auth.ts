import { Request, Response, NextFunction } from "express";
import { verifyLecturerToken, verifyStudentToken } from "../utils/jwt";

export interface AuthedRequest extends Request {
  lecturer?: { id: string };
  student?: { id: string; testId: string; linkToken: string };
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export function requireLecturer(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: "Missing lecturer token" });
  try {
    const payload = verifyLecturerToken(token);
    req.lecturer = { id: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired lecturer token" });
  }
}

/**
 * Verifies the student's JWT AND that its embedded linkToken matches the
 * route's :linkToken param, so a token issued for one test/link cannot be
 * replayed against another.
 */
export function requireStudent(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: "Missing student token" });
  try {
    const payload = verifyStudentToken(token);
    const routeLinkToken = req.params.linkToken;
    if (routeLinkToken && payload.linkToken !== routeLinkToken) {
      return res.status(403).json({ error: "Token not valid for this test link" });
    }
    req.student = { id: payload.sub, testId: payload.testId, linkToken: payload.linkToken };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired student token" });
  }
}
