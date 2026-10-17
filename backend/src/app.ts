import express from "express";
import { securityHeaders, buildCors } from "./middleware/security";
import { generalApiLimiter } from "./middleware/rateLimit";
import authRoutes from "./routes/authRoutes";
import testRoutes from "./routes/testRoutes";
import attemptRoutes from "./routes/attemptRoutes";
import sweepRoutes from "./jobs/sweep";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { requireTrustedOrigin } from "./middleware/originCheck";

const app = express();

app.use(securityHeaders);
app.use(buildCors());
app.use(requireTrustedOrigin);
app.use(express.json({ limit: "1mb" }));
app.use(generalApiLimiter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/attempts", attemptRoutes);
// Protected by a shared secret header, not JWT - meant for a machine caller (cron), not a user.
app.use("/internal", sweepRoutes);

// Never leak stack traces or internal error detail to the client.
app.use(errorHandler);
app.use(notFound);

export default app;
