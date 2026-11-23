
import { Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { AuthedRequest } from "../middleware/auth";
import { SavedRoster } from "../models/SavedRoster";

const createRosterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  students: z.array(
    z.object({
      idNumber: z.string().trim().min(1).max(100),
      name: z.string().trim().max(100).default(""),
    })
  ).min(1),
});

const renameRosterSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

// Create a saved roster.
export async function createSavedRoster(req: AuthedRequest, res: Response) {
  const parsed = createRosterSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.flatten(),
    });
  }

  // Deduplicate by student ID. A later non-empty name takes precedence.
  const students = new Map<string, { idNumber: string; name: string }>();

  for (const student of parsed.data.students) {
    const idNumber = student.idNumber.trim();
    if (!idNumber) continue;

    const existing = students.get(idNumber);

    students.set(idNumber, {
      idNumber,
      name: student.name || existing?.name || "",
    });
  }

  if (students.size === 0) {
    return res.status(400).json({
      error: "The roster must contain at least one valid student.",
    });
  }

  const roster = await SavedRoster.create({
    lecturerId: new Types.ObjectId(req.lecturer!.id),
    name: parsed.data.name,
    students: Array.from(students.values()),
  });

  return res.status(201).json({
    message: "Roster saved successfully.",
    roster: {
      id: roster._id,
      name: roster.name,
      studentCount: roster.students.length,
      createdAt: roster.createdAt,
      updatedAt: roster.updatedAt,
    },
  });
}

// List the authenticated lecturer's saved rosters.
export async function listSavedRosters(req: AuthedRequest, res: Response) {
  const rosters = await SavedRoster.find({
    lecturerId: req.lecturer!.id,
  })
    .select("name students createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  return res.json({
    rosters: rosters.map((roster) => ({
      id: roster._id,
      name: roster.name,
      studentCount: roster.students.length,
      createdAt: roster.createdAt,
      updatedAt: roster.updatedAt,
    })),
  });
}

// View one saved roster, including its students.
export async function getSavedRoster(req: AuthedRequest, res: Response) {
  const roster = await SavedRoster.findOne({
    _id: req.params.rosterId,
    lecturerId: req.lecturer!.id,
  }).lean();

  if (!roster) {
    return res.status(404).json({ error: "Roster not found" });
  }

  return res.json({
    roster: {
      id: roster._id,
      name: roster.name,
      students: roster.students,
      studentCount: roster.students.length,
      createdAt: roster.createdAt,
      updatedAt: roster.updatedAt,
    },
  });
}

// Rename a saved roster.
export async function renameSavedRoster(req: AuthedRequest, res: Response) {
  const parsed = renameRosterSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid roster name." });
  }

  const roster = await SavedRoster.findOneAndUpdate(
    {
      _id: req.params.rosterId,
      lecturerId: req.lecturer!.id,
    },
    { $set: { name: parsed.data.name } },
    { new: true, runValidators: true }
  );

  if (!roster) {
    return res.status(404).json({ error: "Roster not found" });
  }

  return res.json({
    message: "Roster renamed successfully.",
    roster: {
      id: roster._id,
      name: roster.name,
      studentCount: roster.students.length,
      updatedAt: roster.updatedAt,
    },
  });
}

// Delete a saved roster. Existing tests retain their own roster snapshots.
export async function deleteSavedRoster(req: AuthedRequest, res: Response) {
  const result = await SavedRoster.deleteOne({
    _id: req.params.rosterId,
    lecturerId: req.lecturer!.id,
  });

  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Roster not found" });
  }

  return res.json({
    ok: true,
    message: "Saved roster deleted successfully.",
  });
}
