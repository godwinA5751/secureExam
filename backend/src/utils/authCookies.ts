import { Request, Response } from "express";

export const LECTURER_COOKIE = "secureExamLecturer";
export const STUDENT_COOKIE = "secureExamStudent";

const isProduction = process.env.NODE_ENV === "production";

const configuredSameSite = process.env.COOKIE_SAMESITE?.toLowerCase();

if (
  configuredSameSite &&
  !["lax", "strict", "none"].includes(configuredSameSite)
) {
  throw new Error("COOKIE_SAMESITE must be lax, strict, or none");
}

const sameSite =
  (configuredSameSite as "lax" | "strict" | "none" | undefined) ??
  (isProduction ? "none" : "lax");

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite,
  path: "/",
};

export function setAuthCookie(
  res: Response,
  name: string,
  token: string,
  maxAge: number
) {
  res.cookie(name, token, {
    ...cookieOptions,
    maxAge,
  });
}

export function clearAuthCookie(res: Response, name: string) {
  res.clearCookie(name, cookieOptions);
}

export function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const prefix = `${name}=`;

  for (const part of cookieHeader.split(";")) {
    const cookie = part.trim();

    if (cookie.startsWith(prefix)) {
      const value = cookie.slice(prefix.length);

      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}