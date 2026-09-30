import { Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Test } from "../models/Test";
import { Question } from "../models/Question";
import { Attempt } from "../models/Attempt";
import { AuthedRequest } from "../middleware/auth";
import { generateLinkToken, generateAccessCode } from "../utils/token";
import { parseRosterCsv } from "../services/csvService";
import { generateQuestionsForTopics } from "../services/llmService";

const createTestSchema = z.object({
  title: z.string().min(3).max(200),
  topics: z.array(z.string().min(1).max(100)).min(1).max(20),
  loginWindowStart: z.string().datetime(),
  loginWindowEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(480),
  questionGenMode: z.enum(["ai", "manual"]),
  requiresAccessCode: z.boolean().optional(),
});

export async function createTest(req: AuthedRequest, res: Response) {
  const parsed = createTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const start = new Date(data.loginWindowStart);
  const end = new Date(data.loginWindowEnd);
  if (end <= start) return res.status(400).json({ error: "loginWindowEnd must be after loginWindowStart" });

  const requiresAccessCode = data.requiresAccessCode ?? true;
  let accessCodeHash: string | null = null;
  let plainAccessCode: string | null = null;
  if (requiresAccessCode) {
    plainAccessCode = generateAccessCode();
    accessCodeHash = await bcrypt.hash(plainAccessCode, 12);
  }

  const test = await Test.create({
    lecturerId: req.lecturer!.id,
    title: data.title,
    topics: data.topics,
    loginWindowStart: start,
    loginWindowEnd: end,
    durationMinutes: data.durationMinutes,
    linkToken: generateLinkToken(),
    questionGenMode: data.questionGenMode,
    allowedStudents: [],
    requiresAccessCode,
    accessCodeHash,
    status: "draft",
    window: "closed"
  });

  // Plaintext access code is returned ONCE, here, for the lecturer to distribute
  // out-of-band (e.g. printed alongside the roster). It is never stored or logged in plaintext.
  return res.status(201).json({
    test: { id: test._id, title: test.title, linkToken: test.linkToken, status: test.status, window: test.window },
    accessCode: plainAccessCode,
  });
}

async function loadOwnedTest(req: AuthedRequest, res: Response) {
  const test = await Test.findById(req.params.id);
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return null;
  }
  if (test.lecturerId.toString() !== req.lecturer!.id) {
    // Never distinguish "not yours" from "doesn't exist" in the response.
    res.status(404).json({ error: "Test not found" });
    return null;
  }
  return test;
}

export async function uploadRoster(req: AuthedRequest & { file?: Express.Multer.File }, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  if (!req.file) return res.status(400).json({ error: "CSV file required" });

  let result;
  try {
    result = parseRosterCsv(req.file.buffer, req.file.mimetype);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  test.allowedStudents = Array.from(new Set([...test.allowedStudents, ...result.acceptedIds]));
  test.rosterUploadLog.push({
    uploadedAt: new Date(),
    acceptedCount: result.acceptedIds.length,
    rejectedCount: result.rejectedCount,
    rejectedReasons: result.rejectedReasons,
  });
  await test.save();

  return res.json({
    acceptedCount: result.acceptedIds.length,
    rejectedCount: result.rejectedCount,
    rejectedReasons: result.rejectedReasons,
    totalRosterSize: test.allowedStudents.length,
  });
}

export async function regenerateAccessCode(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const plainAccessCode = generateAccessCode();
  test.accessCodeHash = await bcrypt.hash(plainAccessCode, 12);
  test.requiresAccessCode = true;
  await test.save();

  // Shown once, same as at creation - never stored or logged in plaintext.
  return res.json({ accessCode: plainAccessCode });
}

export async function listMyTests(req: AuthedRequest, res: Response) {
  const tests = await Test.find({ lecturerId: req.lecturer!.id })
    .select("title status window linkToken allowedStudents createdAt")
    .sort({ createdAt: -1 });

  return res.json({
    tests: tests.map((t) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      window: t.window,
      linkToken: t.linkToken,
      rosterCount: t.allowedStudents.length,
      createdAt: t.createdAt,
    })),
  });
}

export async function generateQuestions(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  try {
    const generated = await generateQuestionsForTopics(test.topics);
    const docs = await Question.insertMany(
      generated.map((g) => ({ ...g, testId: test._id, approved: false }))
    );
    return res.status(201).json({
      count: docs.length,
      note: "Questions require lecturer review/approval before the test can be published.",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

export async function listQuestions(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  // Lecturer is the author/reviewer, so the answer key IS shown here (+correctOptionIndex).
  const questions = await Question.find({ testId: test._id })
    .select("+correctOptionIndex")
    .sort({ _id: 1 });

  return res.json({
    questions: questions.map((q) => ({
      id: q._id,
      text: q.text,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      topic: q.topic,
      approved: q.approved,
    })),
  });
}

const manualQuestionSchema = z.object({
  text: z.string().min(3).max(1000),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  topic: z.string().min(1).max(100),
});

export async function addManualQuestion(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const parsed = manualQuestionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  if (data.correctOptionIndex >= data.options.length) {
    return res.status(400).json({ error: "correctOptionIndex is out of range for the given options" });
  }

  // Lecturer-authored questions are approved immediately - no separate review step needed
  // since there's no AI output to sanity-check (Security Addendum Section 7.4 concerns AI mode only).
  const question = await Question.create({
    testId: test._id,
    text: data.text,
    options: data.options,
    correctOptionIndex: data.correctOptionIndex,
    topic: data.topic,
    approved: true,
  });

  return res.status(201).json({ id: question._id });
}

const approveSchema = z.object({
  approvedQuestionIds: z.array(z.string()).min(1),
});

export async function reviewQuestions(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  await Question.updateMany(
    { _id: { $in: parsed.data.approvedQuestionIds }, testId: test._id },
    { $set: { approved: true } }
  );
  return res.json({ ok: true });
}

export async function generateLink(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const unapprovedCount = await Question.countDocuments({ testId: test._id, approved: false });
  if (unapprovedCount > 0) {
    return res.status(400).json({
      error: `${unapprovedCount} question(s) still need lecturer approval before publishing`,
    });
  }
  const approvedCount = await Question.countDocuments({ testId: test._id, approved: true });
  if (approvedCount === 0) {
    return res.status(400).json({ error: "Add at least one question before publishing" });
  }
  if (test.allowedStudents.length === 0) {
    return res.status(400).json({ error: "Upload a roster before publishing" });
  }

  test.status = "published";
  test.window = "opened";
  await test.save();
  return res.json({ linkToken: test.linkToken, status: test.status, window: test.window });
}

export async function liveResults(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const attempts = await Attempt.find({
    testId: test._id,
    status: { $in: ["submitted", "auto-submitted"] },
  })
    .populate("studentId", "idNumber")
    .select("studentId status score submittedAt")
    .sort({ submittedAt: -1 });

  return res.json({
    results: attempts.map((a: any) => ({
      idNumber: a.studentId?.idNumber,
      status: a.status,
      score: a.score,
      submittedAt: a.submittedAt,
    })),
  });
}

export async function exportResults(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const attempts = await Attempt.find({ testId: test._id }).populate("studentId", "idNumber");
  const rows = ["idNumber,status,score,submittedAt"];
  for (const a of attempts as any[]) {
    rows.push(
      [a.studentId?.idNumber ?? "", a.status, a.score ?? "", a.submittedAt?.toISOString() ?? ""].join(",")
    );
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${test._id}-results.csv"`);
  return res.send(rows.join("\n"));
}