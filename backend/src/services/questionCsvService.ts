import { parse } from "csv-parse/sync";

const MAX_FILE_BYTES = 1024 * 1024; // 1MB
const MAX_ROWS = 500;
const ALLOWED_MIME = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"];

export interface ParsedQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
  topic: string;
}

export interface QuestionParseResult {
  questions: ParsedQuestion[];
  rejectedCount: number;
  rejectedReasons: string[];
}

export interface ParseOptions {
  defaultTopic: string; // used when a row has no topic
  testTopics: string[]; // topic spellings to snap to ("networking" -> "Networking")
  existingTexts: Set<string>; // duplicateKey() of questions the test already has
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Two questions are "the same" if they match ignoring case and spacing. */
export const duplicateKey = (text: string) => squash(text);

const headerKey = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");
const QUESTION_HEADERS = new Set(["question", "questiontext", "text", "q"]);
const CORRECT_HEADERS = new Set(["correct", "correctanswer", "correctoption", "answer", "key"]);
const TOPIC_HEADERS = new Set(["topic", "category", "subject"]);
const OPTION_HEADER = /^(?:option)?([a-f]|[1-6])$/;

const ordinalOf = (token: string) =>
  /\d/.test(token) ? Number(token) - 1 : token.charCodeAt(0) - 97; // A or 1 -> 0

/** Excel in some regions saves with ";" instead of ",". */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

export function parseQuestionsCsv(
  buffer: Buffer,
  mimeType: string,
  { defaultTopic, testTopics, existingTexts }: ParseOptions
): QuestionParseResult {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("Questions file exceeds the 1MB size limit");
  }
  if (!ALLOWED_MIME.includes(mimeType)) {
    throw new Error("Questions must be uploaded as a .csv file");
  }

  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (text.includes("\uFFFD")) {
    throw new Error('The file is not UTF-8 text. In Excel use Save As and choose "CSV UTF-8 (Comma delimited)".');
  }

  let records: string[][];
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text),
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    });
  } catch (e: any) {
    throw new Error(`The file could not be read as CSV (${String(e?.message ?? e).slice(0, 120)})`);
  }

  if (records.length < 2) throw new Error("The file needs a header row and at least one question row");
  if (records.length - 1 > MAX_ROWS) {
    throw new Error(`The file has more than ${MAX_ROWS} questions. Please split it into smaller files.`);
  }

  // Work out which column is which from the header row.
  let questionCol = -1;
  let correctCol = -1;
  let topicCol = -1;
  const optionCols = new Map<number, number>(); // option position (0 = A) -> column index
  records[0].forEach((raw, col) => {
    const h = headerKey(raw ?? "");
    const opt = OPTION_HEADER.exec(h);
    if (QUESTION_HEADERS.has(h) && questionCol === -1) questionCol = col;
    else if (CORRECT_HEADERS.has(h) && correctCol === -1) correctCol = col;
    else if (TOPIC_HEADERS.has(h) && topicCol === -1) topicCol = col;
    else if (opt && !optionCols.has(ordinalOf(opt[1]))) optionCols.set(ordinalOf(opt[1]), col);
  });
  if (questionCol === -1 || correctCol === -1 || optionCols.size < 2) {
    throw new Error(
      "Could not find the columns. The first row must be a header like: question, A, B, C, D, correct, topic"
    );
  }

  const seen = new Set<string>();
  const questions: ParsedQuestion[] = [];
  const reasons: string[] = [];
  let rejectedCount = 0;
  const reject = (rowNumber: number, why: string) => {
    rejectedCount += 1;
    if (reasons.length < 100) reasons.push(`Row ${rowNumber}: ${why}`);
  };

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const rowNumber = i + 1; // matches the row number in a spreadsheet (the header is row 1)
    if (row.every((c) => !(c ?? "").trim())) continue; // a row of empty cells

    const cell = (col: number) => (col >= 0 ? (row[col] ?? "").replace(/\r\n/g, "\n").trim() : "");

    const questionText = cell(questionCol);
    if (!questionText) {
      reject(rowNumber, "missing question text");
      continue;
    }
    if (questionText.length < 3 || questionText.length > 1000) {
      reject(rowNumber, "the question must be 3 to 1000 characters");
      continue;
    }

    // Options keep their column position, so "C" always means the C column even if B is empty.
    const options: { ordinal: number; text: string }[] = [];
    for (const [ordinal, col] of [...optionCols].sort((a, b) => a[0] - b[0])) {
      const t = cell(col);
      if (t) options.push({ ordinal, text: t });
    }
    if (options.length < 2) {
      reject(rowNumber, "needs at least 2 options");
      continue;
    }
    if (options.some((o) => o.text.length > 300)) {
      reject(rowNumber, "an option is longer than 300 characters");
      continue;
    }
    if (new Set(options.map((o) => squash(o.text))).size !== options.length) {
      reject(rowNumber, "two options are identical");
      continue;
    }

    const rawCorrect = cell(correctCol);
    if (!rawCorrect) {
      reject(rowNumber, "missing correct answer");
      continue;
    }
    let correctOrdinal = -1;
    const letter = /^([a-f])$/i.exec(rawCorrect);
    const digit = /^([1-6])$/.exec(rawCorrect);
    if (letter) {
      correctOrdinal = letter[1].toLowerCase().charCodeAt(0) - 97;
    } else if (digit) {
      correctOrdinal = Number(digit[1]) - 1;
    } else {
      // Friendly extra: the cell may hold the exact text of the correct option.
      const byText = options.find((o) => squash(o.text) === squash(rawCorrect));
      if (byText) correctOrdinal = byText.ordinal;
    }
    if (correctOrdinal === -1) {
      reject(rowNumber, `correct answer "${rawCorrect.slice(0, 20)}" must be one letter from A to F`);
      continue;
    }
    const correctOptionIndex = options.findIndex((o) => o.ordinal === correctOrdinal);
    if (correctOptionIndex === -1) {
      reject(rowNumber, "the correct answer points to an empty option");
      continue;
    }

    const rawTopic = (cell(topicCol) || defaultTopic).slice(0, 100);
    if (!rawTopic) {
      reject(rowNumber, "no topic");
      continue;
    }
    const topic = testTopics.find((t) => squash(t) === squash(rawTopic)) ?? rawTopic;

    const key = duplicateKey(questionText);
    if (seen.has(key) || existingTexts.has(key)) {
      reject(rowNumber, "duplicate question");
      continue;
    }
    seen.add(key);

    questions.push({
      text: questionText,
      options: options.map((o) => o.text),
      correctOptionIndex,
      topic,
    });
  }

  return { questions, rejectedCount, rejectedReasons: reasons };
}