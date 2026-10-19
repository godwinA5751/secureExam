import { parse } from "csv-parse/sync";

const MAX_FILE_BYTES = 512 * 1024; // 512KB cap
const MAX_ROWS = 5000;
// Adjust to the institution's real ID format. Deliberately strict allow-list.
const ID_FORMAT = /^[A-Za-z0-9\-/]{4,20}$/;
// Names: letters in any language, spaces and . , ' ’ -  ; must start with a letter; max 100 chars.
const NAME_FORMAT = /^[\p{L}\p{M}][\p{L}\p{M} .,'’-]{0,99}$/u;
const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

// A first row like "idNumber,name" or "Student ID,Full name" is a header, not a student.
const HEADER_ID = /^(id|student[ _-]?id|id[ _-]?(no|num|number)|matric[ _-]?(no|number)?|reg[ _-]?(no|number)?)$/i;
const HEADER_NAME = /^(name|full[ _-]?name|student[ _-]?name)$/i;

export interface RosterStudent {
  idNumber: string;
  name: string; // "" when the CSV had no (valid) name
}

export interface RosterParseResult {
  acceptedIds: string[];
  acceptedStudents: RosterStudent[];
  ignoredNameCount: number;
  nameWarnings: string[];
  rejectedCount: number;
  rejectedReasons: string[];
}

function stripFormulaInjection(cell: string): string {
  let c = cell.trim();
  // Neutralize CSV/formula injection if this file is ever reopened in Excel/Sheets.
  while (c.length > 0 && DANGEROUS_LEADING_CHARS.includes(c[0])) {
    c = c.slice(1);
  }
  return c;
}

function looksLikeHeader(row: string[]): boolean {
  return HEADER_NAME.test((row[1] ?? "").trim()) || HEADER_ID.test((row[0] ?? "").trim());
}

export function parseRosterCsv(buffer: Buffer, mimeType: string): RosterParseResult {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error("Roster file exceeds the 512KB size limit");
  }
  if (!["text/csv", "application/vnd.ms-excel", "text/plain"].includes(mimeType)) {
    throw new Error("Roster must be uploaded as a .csv file");
  }

  const records: string[][] = parse(buffer, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true, // Excel often saves CSVs with a UTF-8 byte-order mark
  });

  if (records.length > MAX_ROWS) {
    throw new Error(`Roster exceeds the ${MAX_ROWS}-row limit`);
  }

  const seen = new Set<string>();
  const acceptedIds: string[] = [];
  const acceptedStudents: RosterStudent[] = [];
  const rejectedReasons: string[] = [];
  const nameWarnings: string[] = [];
  let rejectedCount = 0;
  let ignoredNameCount = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    if (i === 0 && looksLikeHeader(row)) continue;

    const raw = row[0] ?? "";
    const cleaned = stripFormulaInjection(raw);

    if (!ID_FORMAT.test(cleaned)) {
      rejectedCount += 1;
      rejectedReasons.push(`Invalid ID format: "${raw.slice(0, 30)}"`);
      continue;
    }
    if (seen.has(cleaned)) {
      rejectedCount += 1;
      rejectedReasons.push(`Duplicate ID: "${cleaned}"`);
      continue;
    }

    // Optional second column: the student's display name. A bad name never blocks the ID.
    let name = "";
    const rawName = row[1] ?? "";
    if (rawName) {
      const candidate = stripFormulaInjection(rawName.replace(/\s+/g, " "));
      if (NAME_FORMAT.test(candidate)) {
        name = candidate;
      } else {
        ignoredNameCount += 1;
        nameWarnings.push(`Name ignored for "${cleaned}": unsupported characters`);
      }
    }

    seen.add(cleaned);
    acceptedIds.push(cleaned);
    acceptedStudents.push({ idNumber: cleaned, name });
  }

  return {
    acceptedIds,
    acceptedStudents,
    ignoredNameCount,
    nameWarnings: nameWarnings.slice(0, 50),
    rejectedCount,
    rejectedReasons: rejectedReasons.slice(0, 100),
  };
}