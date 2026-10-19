import { Router } from "express";
import { requireStudent } from "../middleware/auth";
import {
  getOrCreateAttempt,
  getQuestions,
  getAttemptInfo,
  heartbeat,
  saveAnswer,
  submitAttempt,
} from "../controllers/attemptController";
import { asyncHandler as h } from "../utils/asyncHandler";
import { attemptLimiter } from "../middleware/rateLimit";

const router = Router();

router.use("/:linkToken", requireStudent, attemptLimiter);

router.post("/:linkToken/start", h(getOrCreateAttempt));
router.get("/:linkToken/info", h(getAttemptInfo));
router.get("/:linkToken/questions", h(getQuestions));
router.post("/:linkToken/heartbeat", h(heartbeat));
router.post("/:linkToken/answer", h(saveAnswer));
router.post("/:linkToken/submit", h(submitAttempt));

export default router;