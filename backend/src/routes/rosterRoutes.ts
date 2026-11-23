
import { Router } from "express";
import { requireLecturer } from "../middleware/auth";
import { objectIdParam } from "../middleware/validateObjectId";
import { asyncHandler as h } from "../utils/asyncHandler";

import {
  createSavedRoster,
  listSavedRosters,
  getSavedRoster,
  renameSavedRoster,
  deleteSavedRoster,
} from "../controllers/savedRosterController";

const router = Router();

router.use(requireLecturer);

router.param("rosterId", objectIdParam);

router.get("/", h(listSavedRosters));
router.post("/", h(createSavedRoster));
router.get("/:rosterId", h(getSavedRoster));
router.patch("/:rosterId", h(renameSavedRoster));
router.delete("/:rosterId", h(deleteSavedRoster));

export default router;
