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
import { buildResultsCsv, fileSlug } from "../services/exportService";
import { Types } from "mongoose";
import { User } from "../models/User";
import { parsePaging } from "../utils/paging";
import { totalMarksOf } from "../services/scoring";

const createTestSchema = z.object({
  title: z.string().min(3).max(200),
  topics: z.array(z.string().min(1).max(100)).min(1).max(20),
  instructions: z.string().max(4000).optional(),
  loginWindowStart: z.string().datetime(),
  loginWindowEnd: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(480),
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
    instructions: data.instructions ?? "",
    loginWindowStart: start,
    loginWindowEnd: end,
    durationMinutes: data.durationMinutes,
    linkToken: generateLinkToken(),
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

  // Merge names: a newer upload overwrites a name, but a blank name never erases an existing one.
  const names = new Map<string, string>((test.rosterNames ?? []).map((r) => [r.idNumber, r.name]));
  for (const s of result.acceptedStudents) {
    if (s.name) names.set(s.idNumber, s.name);
  }

  test.rosterNames = Array.from(names, ([idNumber, name]) => ({ idNumber, name }));

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
    namesAdded: result.acceptedStudents.filter((s) => s.name).length,
    ignoredNameCount: result.ignoredNameCount,
    nameWarnings: result.nameWarnings,
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
  const lecturerId = new Types.ObjectId(req.lecturer!.id);
  const { page, pageSize, skip } = parsePaging(req.query, 10, 50);

  const [rows, summaryRows] = await Promise.all([
    // The roster is counted inside MongoDB, so thousands of IDs are never loaded just to show a number.
    Test.aggregate([
      { $match: { lecturerId } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $project: {
          title: 1,
          status: 1,
          window: 1,
          linkToken: 1,
          createdAt: 1,
          rosterCount: { $size: { $ifNull: ["$allowedStudents", []] } },
        },
      },
    ]),
    // Totals across ALL of this lecturer's tests, for the pager and the dashboard cards.
    Test.aggregate([
      { $match: { lecturerId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
          drafts: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
          students: { $sum: { $size: { $ifNull: ["$allowedStudents", []] } } },
        },
      },
    ]),
  ]);

  const s = summaryRows[0] ?? { total: 0, published: 0, drafts: 0, students: 0 };
  return res.json({
    tests: rows.map((t: any) => ({
      id: t._id,
      title: t.title,
      status: t.status,
      window: t.window,
      linkToken: t.linkToken,
      rosterCount: t.rosterCount,
      createdAt: t.createdAt,
    })),
    page,
    pageSize,
    total: s.total,
    totalPages: Math.max(1, Math.ceil(s.total / pageSize)),
    summary: { total: s.total, published: s.published, drafts: s.drafts, students: s.students },
  });
}

/** Questions on a published test are frozen: students may already be sitting it. */
function rejectIfPublished(test: { status: string }, res: Response): boolean {
  if (test.status === "published") {
    res.status(400).json({ error: "This test is published, so its questions can no longer be changed" });
    return true;
  }
  return false;
}

const MAX_AI_GENERATIONS_PER_TEST = Number(process.env.AI_GENERATIONS_PER_TEST ?? 3);
const MAX_QUESTIONS_PER_RUN = Number(process.env.AI_MAX_QUESTIONS_PER_RUN ?? 40);
const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_QUESTIONS_PER_RUN).optional(),
});

export async function generateQuestions(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  if (rejectIfPublished(test, res)) return;

  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: `Choose between 1 and ${MAX_QUESTIONS_PER_RUN} questions to generate` });
  }
  const count = parsed.data.count ?? Math.min(MAX_QUESTIONS_PER_RUN, test.topics.length * 5);

  // Reserve one run atomically. This also stops a double-click from running two at once
  // past the cap. Tests created before this field existed count as 0 runs used.
  const reserved = await Test.findOneAndUpdate(
    {
      _id: test._id,
      $or: [
        { aiGenerationCount: { $lt: MAX_AI_GENERATIONS_PER_TEST } },
        { aiGenerationCount: { $exists: false } },
      ],
    },
    { $inc: { aiGenerationCount: 1 } },
    { new: true }
  );
  if (!reserved) {
    return res.status(429).json({
      error: `AI generation limit reached for this test (${MAX_AI_GENERATIONS_PER_TEST} runs). Add the remaining questions manually.`,
    });
  }

  const started = Date.now();
  try {
    const generated = await generateQuestionsForTopics(test.topics, count);
    const docs = await Question.insertMany(
      generated.map((g) => ({ ...g, testId: test._id, approved: false }))
    );
    console.log("[ai] generated", {
      lecturerId: req.lecturer!.id,
      testId: test._id.toString(),
      requested: count,
      questions: docs.length,
      ms: Date.now() - started,
    });
    return res.status(201).json({
      count: docs.length,
      requested: count,
      remainingGenerations: Math.max(0, MAX_AI_GENERATIONS_PER_TEST - reserved.aiGenerationCount),
      note: "Questions require lecturer review/approval before the test can be published.",
    });
  } catch (e: any) {
    // A failed run doesn't use up the lecturer's allowance.
    await Test.updateOne({ _id: test._id }, { $inc: { aiGenerationCount: -1 } });
    console.error("[generateQuestions] failed:", e);
    return res.status(502).json({ error: "Question generation failed. Please try again." });
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
  if (rejectIfPublished(test, res)) return;

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

const updateQuestionSchema = z.object({
  text: z.string().min(3).max(1000),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  topic: z.string().min(1).max(100),
});

export async function updateQuestion(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  const { questionId } = req.params;

  const parsed = updateQuestionSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.flatten(),
    });
  }

  const data = parsed.data;

  if (data.correctOptionIndex >= data.options.length) {
    return res.status(400).json({
      error: "correctOptionIndex is out of range for the given options",
    });
  }

  const question = await Question.findOne({
    _id: questionId,
    testId: test._id,
  }).select("+correctOptionIndex");

  if (!question) {
    return res.status(404).json({
      error: "Question not found",
    });
  }

  // Published tests should not have their questions changed.
  if (test.status === "published") {
    return res.status(400).json({
      error: "Published tests cannot have their questions edited",
    });
  }

  question.text = data.text;
  question.options = data.options;
  question.correctOptionIndex = data.correctOptionIndex;
  question.topic = data.topic;

  // Any edited question must be reviewed again.
  question.approved = false;

  await question.save();

  return res.json({
    ok: true,
    question: {
      id: question._id,
      text: question.text,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      topic: question.topic,
      approved: question.approved,
    },
  });
}

export async function deleteTest(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  // Never delete a test while students are still sitting it.
  const liveAttempts = await Attempt.countDocuments({
    testId: test._id,
    status: "in-progress",
    deadline: { $gt: new Date() },
  });
  if (liveAttempts > 0) {
    return res.status(409).json({
      error: `${liveAttempts} student(s) are sitting this test right now. Try again after they finish.`,
    });
  }

  // Delete all questions belonging to the test
  await Question.deleteMany({
    testId: test._id,
  });

  // Delete all attempts belonging to the test
  await Attempt.deleteMany({
    testId: test._id,
  });

  // Delete the test itself
  await Test.deleteOne({
    _id: test._id,
  });

  return res.json({
    ok: true,
    message: "Test deleted successfully",
  });
}

const approveSchema = z.object({
  approvedQuestionIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1),
});

export async function reviewQuestions(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  if (rejectIfPublished(test, res)) return;
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
  if (test.questionsPerStudent && test.questionsPerStudent > approvedCount) {
    return res.status(400).json({
      error: `Each student is set to get ${test.questionsPerStudent} questions, but only ${approvedCount} are approved. Approve or add more questions, or lower the number per student.`,
    });
  }
  if (test.allowedStudents.length === 0) {
    return res.status(400).json({ error: "Upload a roster before publishing" });
  }

  test.status = "published";
  test.window = "opened";
  await test.save();
  return res.json({ linkToken: test.linkToken, status: test.status, window: test.window });
}

function nameLookup(test: { rosterNames?: { idNumber: string; name: string }[] }) {
  return new Map((test.rosterNames ?? []).map((r) => [r.idNumber, r.name]));
}

export async function liveResults(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  const nameById = nameLookup(test);
  const { page, pageSize, skip } = parsePaging(req.query, 25, 100);

  const finalStates = ["submitted", "auto-submitted"];
  const statusParam = String(req.query.status ?? "all");
  const filter: Record<string, unknown> = {
    testId: test._id,
    status: finalStates.includes(statusParam) ? statusParam : { $in: finalStates },
  };

  // Search matches student ID or roster name. Names live on the test, so resolve matches
  // to student accounts first. Plain substring matching: no regex built from user input.
  const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 100);
  if (q) {
    const ids = new Set<string>();
    for (const id of test.allowedStudents) if (id.toLowerCase().includes(q)) ids.add(id);
    for (const r of test.rosterNames ?? []) if (r.name.toLowerCase().includes(q)) ids.add(r.idNumber);
    const users = await User.find({ idNumber: { $in: [...ids] } }).select("_id");
    filter.studentId = { $in: users.map((u) => u._id) };
  }

  const [attempts, total, summaryRows] = await Promise.all([
    Attempt.find(filter)
      .populate("studentId", "idNumber")
      .select("studentId status score submittedAt shuffleMap.questionOrder totalMarks marksPerQuestion")
      .sort({ submittedAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize),
    Attempt.countDocuments(filter),
    // Stat cards always describe the WHOLE test, whatever the search or filter says.
    Attempt.aggregate([
      { $match: { testId: test._id, status: { $in: finalStates } } },
      {
        $group: {
          _id: null,
          submitted: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
          autoSubmitted: { $sum: { $cond: [{ $eq: ["$status", "auto-submitted"] }, 1, 0] } },
          scored: { $sum: { $cond: [{ $isNumber: "$score" }, 1, 0] } },
          scoreSum: { $sum: { $cond: [{ $isNumber: "$score" }, "$score", 0] } },
          totalPossible: {
            $max: {
              $ifNull: [
                "$totalMarks",
                {
                  $multiply: [
                    { $size: { $ifNull: ["$shuffleMap.questionOrder", []] } },
                    { $ifNull: ["$marksPerQuestion", 1] },
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const agg = summaryRows[0];
  return res.json({
    results: attempts.map((a: any) => {
      const idNumber = a.studentId?.idNumber ?? "";
      return {
        idNumber,
        name: nameById.get(idNumber) ?? "",
        status: a.status === "auto-submitted" ? "auto-submitted" : "submitted",
        score: a.score ?? null,
        total: totalMarksOf(a),
        submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString() : null,
      };
    }),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      submitted: agg?.submitted ?? 0,
      autoSubmitted: agg?.autoSubmitted ?? 0,
      averageScore: agg && agg.scored > 0 ? agg.scoreSum / agg.scored : null,
      totalPossible: agg?.totalPossible || null,
    },
  });
}

const settingsSchema = z.object({
  questionsPerStudent: z.number().int().min(1).max(500).nullable().optional(),
  marksPerQuestion: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function updateSettings(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;
  if (test.status === "published") {
    return res.status(400).json({ error: "This test is published, so its settings can no longer be changed" });
  }

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings" });

  if (parsed.data.questionsPerStudent !== undefined) {
    test.questionsPerStudent = parsed.data.questionsPerStudent;
  }
  if (parsed.data.marksPerQuestion !== undefined) {
    test.marksPerQuestion = parsed.data.marksPerQuestion;
  }
  await test.save();

  return res.json({
    questionsPerStudent: test.questionsPerStudent ?? null,
    marksPerQuestion: test.marksPerQuestion ?? 1,
  });
}

export async function exportResults(req: AuthedRequest, res: Response) {
  const test = await loadOwnedTest(req, res);
  if (!test) return;

  // No answers are loaded here: the export doesn't need them and they make big classes slow.
  const attempts = await Attempt.find({ testId: test._id })
    .populate("studentId", "idNumber")
    .select("studentId status score startedAt submittedAt visibilityEvents shuffleMap.questionOrder totalMarks marksPerQuestion");

  const csv = buildResultsCsv(test, attempts as any[]);
  const filename = `${fileSlug(test.title)}-results-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // The BOM makes Excel read non-English names correctly.
  return res.send("\uFEFF" + csv);
}