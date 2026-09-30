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

export function buildCors(): RequestHandler {
  const allowed = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim());
  return cors({
    origin: allowed,
    credentials: true,
  });
}
