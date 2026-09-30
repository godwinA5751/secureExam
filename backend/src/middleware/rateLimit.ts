import rateLimit from "express-rate-limit";

/** Per-IP guard against brute force / scraping, layered on top of per-ID lockout in the controller. */
export const studentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // per IP across all ID numbers - the per-ID lockout below is the tighter control
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this network. Try again later." },
});

export const lecturerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

export const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
