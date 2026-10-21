import { Router } from "express";
import multer from "multer";
import { requireLecturer } from "../middleware/auth";
import { objectIdParam } from "../middleware/validateObjectId";
import { asyncHandler as h } from "../utils/asyncHandler";
import {
  createTest,
  listMyTests,
  uploadRoster,
  generateQuestions,
  listQuestions,
  addManualQuestion,
  updateQuestion,
  reviewQuestions,
  generateLink,
  regenerateAccessCode,
  liveResults,
  exportResults,
  deleteTest,
  updateSettings,
} from "../controllers/testController";
import { aiGenerationLimiter } from "../middleware/rateLimit";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });
const router = Router();

router.use(requireLecturer);

// Malformed IDs get a controlled 400 before any database query.
router.param("id", objectIdParam);
router.param("questionId", objectIdParam);

router.get("/", h(listMyTests));
router.post("/", h(createTest));
router.post("/:id/roster", upload.single("roster"), h(uploadRoster));
router.post("/:id/generate-questions", h(generateQuestions));
router.get("/:id/questions", h(listQuestions));
router.post("/:id/questions/manual", aiGenerationLimiter, h(addManualQuestion));
router.patch("/:id/questions/:questionId", h(updateQuestion));
router.patch("/:id/questions", h(reviewQuestions));
router.post("/:id/link", h(generateLink));
router.post("/:id/access-code/regenerate", h(regenerateAccessCode));
router.get("/:id/results", h(liveResults));
router.get("/:id/export", h(exportResults));
router.patch("/:id/settings", h(updateSettings));
router.delete("/:id", h(deleteTest));

export default router;