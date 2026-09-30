import crypto from "crypto";

/** >=128 bits of entropy, URL-safe. Used for Test.linkToken. */
export function generateLinkToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/** 6-digit numeric access code distributed by the lecturer alongside the roster. */
export function generateAccessCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateSweepAuthCheck(providedSecret: string | undefined): boolean {
  const expected = process.env.SWEEP_SECRET;
  if (!expected || !providedSecret) return false;
  const a = Buffer.from(providedSecret);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
