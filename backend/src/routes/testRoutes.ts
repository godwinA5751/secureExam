import { Router } from "express";
import multer from "multer";
import { requireLecturer } from "../middleware/auth";
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
  deleteTest
} from "../controllers/testController";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });
const router = Router();

router.use(requireLecturer);

router.get("/", listMyTests);
router.post("/", createTest);
router.post("/:id/roster", upload.single("roster"), uploadRoster);
router.post("/:id/generate-questions", generateQuestions);
router.get("/:id/questions", listQuestions);
router.post("/:id/questions/manual", addManualQuestion);
router.patch("/:id/questions/:questionId", updateQuestion);
router.patch("/:id/questions", reviewQuestions);
router.post("/:id/link", generateLink);
router.post("/:id/access-code/regenerate", regenerateAccessCode);
router.get("/:id/results", liveResults);
router.get("/:id/export", exportResults);
router.delete("/:id", deleteTest);

export default router;