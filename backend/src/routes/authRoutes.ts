import { Router } from "express";
import {
  lecturerRegister,
  lecturerLogin,
  studentLogin,
  getLecturerProfile,
  updateLecturerProfile,
  changeLecturerPassword,
  logout,
} from "../controllers/authController";
import { studentLoginLimiter, lecturerLoginLimiter } from "../middleware/rateLimit";
import { requireLecturer } from "../middleware/auth";
import { asyncHandler as h } from "../utils/asyncHandler";

const router = Router();

router.post("/lecturer/register", lecturerLoginLimiter, h(lecturerRegister));
router.post("/lecturer/login", lecturerLoginLimiter, h(lecturerLogin));
router.get("/lecturer/me", requireLecturer, h(getLecturerProfile));
router.patch(
  "/lecturer/me",
  requireLecturer,
  h(updateLecturerProfile)
);
router.patch(
  "/lecturer/change-password",
  requireLecturer,
  h(changeLecturerPassword)
);
router.post("/student/login", studentLoginLimiter, h(studentLogin));
router.post("/logout", h(logout));
export default router;