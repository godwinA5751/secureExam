# SecureExam

Lecturer-managed, AI-assisted online testing platform. Lecturers upload a roster,
generate and review questions, publish a timed test link, and watch results live.
Students log in with their ID number and an access code and sit the test in a locked page.

## Structure

```
backend/    Express + TypeScript API, MongoDB/Mongoose, JWT auth in httpOnly cookies
frontend/   Next.js (pages router) + Tailwind - lecturer & student UI
```

## Setup

### Backend

```bash
cd backend
cp .env.example .env    # then fill it in (see comments inside)
npm install
npm run dev             # http://localhost:4000
```

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend

```bash
cd frontend
cp .env.example .env.local   # only needed if the API is not on localhost:4000
npm install
npm run dev                  # http://localhost:3000
```

## Tests

```bash
cd backend
npm test
```

The database tests start a temporary in-memory MongoDB. The **first run downloads a
MongoDB binary** (needs internet and some disk space); it is cached afterwards. Your real
database is never touched.

## Environment variables (backend)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_LECTURER_SECRET`, `JWT_STUDENT_SECRET` | Token signing secrets (16+ chars, different values) |
| `CORS_ORIGINS` | Comma-separated frontend origins allowed to call the API; also drives the CSRF Origin check |
| `COOKIE_SAMESITE` | Optional override (`lax`/`strict`/`none`); default `none` in production, `lax` in development |
| `SWEEP_SECRET` | Shared secret for `POST /internal/sweep` |
| `SWEEP_INTERVAL_SECONDS` | In-process sweep interval (default 60, `0` disables) |
| `LLM_API_KEY`, `GEMINI_MODELS` | Google Gemini key and optional model fallback list |
| `PORT`, `NODE_ENV` | Server port; set `NODE_ENV=production` when deployed | `LLM_REQUEST_TIMEOUT_MS`, `LLM_TOTAL_TIMEOUT_MS`, `AI_GENERATIONS_PER_TEST`, `AI_GENERATIONS_PER_LECTURER_PER_HOUR` | AI generation timeouts and usage limits (defaults 30000, 60000, 3, 10) |

Frontend: `NEXT_PUBLIC_API_BASE` (API base URL).

## Deadlines and the sweep

Deadlines are enforced three ways: the student page heartbeat, a server recheck on every
answer write, and a sweep that force-submits overdue attempts and repairs any finalized
attempt that is missing a score.

- The sweep runs inside the server every `SWEEP_INTERVAL_SECONDS`.
- Hosts that sleep when idle (e.g. Render free tier) also need an external ping. See
  `.github/workflows/sweep.yml`, which calls `POST /internal/sweep` with header
  `x-sweep-secret: <SWEEP_SECRET>`. Add `API_BASE_URL` and `SWEEP_SECRET` as repository secrets.

All paths finalize through one function (`services/scoring.ts`), which claims the attempt
atomically, so submit, heartbeat, deadline and sweep can all run at once without double-scoring.

## Where each control lives

| Control | Location |
|---|---|
| One attempt per student, atomically | `Attempt` unique index (`testId`,`studentId`) + upsert in `attemptController.getOrCreateAttempt` |
| Answer key never sent to students | `Question.correctOptionIndex` is `select: false`; `toStudentSafeQuestion()` strips it; scoring loads it server-side only |
| Single scoring/finalization path | `services/scoring.ts` (`finalizeAttempt`, `rescoreMissing`) |
| Race-free answer saving | `services/answers.ts` (atomic updates that only match an in-progress, unexpired attempt) |
| Login rate limiting + lockout | `middleware/rateLimit.ts` (per-IP login limiters) plus lockout after repeated failures in `authController` |
| Exam-traffic rate limit per student | `attemptLimiter` in `middleware/rateLimit.ts` (not per IP, so a class can share one network) |
| Second-factor access code | `Test.accessCodeHash` (bcrypt), checked in `authController.studentLogin` |
| Scoped, short-lived tokens in httpOnly cookies | `utils/jwt.ts`, `utils/authCookies.ts` |
| CSRF defence | `middleware/originCheck.ts` rejects state-changing requests from origins not in `CORS_ORIGINS` |
| Async error handling, ID validation | `utils/asyncHandler.ts`, `middleware/validateObjectId.ts`, `middleware/errorHandler.ts` |
| Published tests are frozen | question add/generate/review are rejected once a test is published |
| CSV roster hardening | `services/csvService.ts` (size cap, MIME check, formula-injection stripping, ID allow-list, de-dup) |
| Tab-visibility anti-cheat | `student/test.tsx` reports `blur`/`visibilitychange` to `heartbeat`, which force-submits |
| Headers/CORS | `middleware/security.ts` (helmet, CSP `frame-ancestors: none`, scoped CORS) |
| Ownership checks | Every lecturer route re-verifies `test.lecturerId` (`loadOwnedTest`) |

## Deployment notes

- Set `NODE_ENV=production` (enables `Secure` cookies) and serve both apps over HTTPS.
- Set `CORS_ORIGINS` to the exact frontend URL(s), e.g. `https://your-app.vercel.app`.
- Frontend and backend on **different sites** (e.g. Vercel + Render): leave `COOKIE_SAMESITE` unset.
  Same parent domain: set `COOKIE_SAMESITE=lax`.

## Known trade-offs

- Tab-visibility detection is a deterrent, not proof. Any loss of focus ends the attempt
  immediately, which is strict; tell students to close other windows and notifications first.
- AI-generated questions are saved unapproved and must be reviewed by the lecturer before publishing.
- Auth cookies use `SameSite=None` in production when frontend and backend are on different sites;
  the Origin check is what protects state-changing requests in that setup.