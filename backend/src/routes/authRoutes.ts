import { Router } from "express";
import { lecturerRegister, lecturerLogin, studentLogin, getLecturerProfile } from "../controllers/authController";
import { studentLoginLimiter, lecturerLoginLimiter } from "../middleware/rateLimit";
import { requireLecturer } from "../middleware/auth";

const router = Router();

router.post("/lecturer/register", lecturerLoginLimiter, lecturerRegister);
router.post("/lecturer/login", lecturerLoginLimiter, lecturerLogin);
router.get("/lecturer/me", requireLecturer, getLecturerProfile);
router.post("/student/login", studentLoginLimiter, studentLogin);

export default router;