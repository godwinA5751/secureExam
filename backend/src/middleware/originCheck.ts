import { NextFunction, Request, Response } from "express";
import { allowedOrigins } from "./security";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The caller's origin: the Origin header, else the Referer's origin, else undefined. */
function callerOrigin(req: Request): string | undefined {
  const origin = req.header("origin");
  if (origin !== undefined) return origin; // may be the literal string "null"
  const referer = req.header("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return "null";
    }
  }
  return undefined;
}

/**
 * CSRF defence for cookie-authenticated requests. Browsers always attach Origin to
 * cross-site POSTs, so a forged request from another site is rejected here even if
 * the cookie is sent along. Requests with no Origin/Referer are not browser
 * cross-site requests (curl, cron) and fall through to their own auth.
 */
export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = callerOrigin(req);
  if (origin === undefined) return next();
  if (allowedOrigins().includes(origin)) return next();

  return res.status(403).json({ error: "Untrusted origin" });
}