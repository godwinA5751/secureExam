import { Router } from "express";
import multer from "multer";
import { requireLecturer } from "../middleware/auth";
import { objectIdParam } from "../middleware/validateObjectId";
import { asyncHandler as h } from "../utils/asyncHandler";
import {
  createTest,
  listMyTests,
  uploadRoster,
  uploadQuestions,
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
  bulkQuestions,
  deleteQuestion
} from "../controllers/testController";
import { aiGenerationLimiter } from "../middleware/rateLimit";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });
const questionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const router = Router();

router.use(requireLecturer);

// Malformed IDs get a controlled 400 before any database query.
router.param("id", objectIdParam);
router.param("questionId", objectIdParam);

router.get("/", h(listMyTests));
router.post("/", h(createTest));
router.post("/:id/roster", upload.single("roster"), h(uploadRoster));
router.post("/:id/generate-questions", aiGenerationLimiter, h(generateQuestions));
router.post("/:id/questions/upload", questionUpload.single("questions"), h(uploadQuestions));
router.get("/:id/questions", h(listQuestions));
router.post("/:id/questions/manual", h(addManualQuestion));
router.post("/:id/questions/bulk", h(bulkQuestions));
router.patch("/:id/questions/:questionId", h(updateQuestion));
router.patch("/:id/questions", h(reviewQuestions));
router.post("/:id/link", h(generateLink));
router.post("/:id/access-code/regenerate", h(regenerateAccessCode));
router.get("/:id/results", h(liveResults));
router.get("/:id/export", h(exportResults));
router.patch("/:id/settings", h(updateSettings));
router.delete("/:id/questions/:questionId", h(deleteQuestion));
router.delete("/:id", h(deleteTest));

export default router; 