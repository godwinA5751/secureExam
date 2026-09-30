import { Router } from "express";
import { requireStudent } from "../middleware/auth";
import {
  getOrCreateAttempt,
  getQuestions,
  heartbeat,
  saveAnswer,
  submitAttempt,
} from "../controllers/attemptController";

const router = Router();

router.use("/:linkToken", requireStudent);

router.post("/:linkToken/start", getOrCreateAttempt);
router.get("/:linkToken/questions", getQuestions);
router.post("/:linkToken/heartbeat", heartbeat);
router.post("/:linkToken/answer", saveAnswer);
router.post("/:linkToken/submit", submitAttempt);

export default router;
