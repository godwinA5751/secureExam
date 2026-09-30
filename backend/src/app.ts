import express from "express";
import { securityHeaders, buildCors } from "./middleware/security";
import { generalApiLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/authRoutes";
import testRoutes from "./routes/testRoutes";
import attemptRoutes from "./routes/attemptRoutes";
import sweepRoutes from "./jobs/sweep";

const app = express();

app.use(securityHeaders);
app.use(buildCors());
app.use(express.json({ limit: "1mb" }));
app.use(generalApiLimiter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/attempts", attemptRoutes);
// Protected by a shared secret header, not JWT - meant for a machine caller (cron), not a user.
app.use("/internal", sweepRoutes);

// Never leak stack traces or internal error detail to the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(err.status ?? 500).json({ error: "Internal server error" });
});

export default app;
