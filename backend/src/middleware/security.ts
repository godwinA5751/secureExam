import helmet from "helmet";
import cors from "cors";
import { RequestHandler } from "express";

export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Test-taking page must not be embeddable in another site (clickjacking/proctoring bypass defense)
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/** Single source of truth for which frontend sites may call this API. */
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function buildCors(): RequestHandler {
  return cors({
    origin: allowedOrigins(),
    credentials: true,
  });
}
