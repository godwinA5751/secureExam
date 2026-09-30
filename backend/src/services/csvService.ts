import { parse } from "csv-parse/sync";

const MAX_FILE_BYTES = 512 * 1024; // 512KB cap
const MAX_ROWS = 5000;
// Adjust to the institution's real ID format. Deliberately strict allow-list.
const ID_FORMAT = /^[A-Za-z0-9\-/]{4,20}$/;
const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

export interface RosterParseResult {
  acceptedIds: string[];
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
  });

  if (records.length > MAX_ROWS) {
    throw new Error(`Roster exceeds the ${MAX_ROWS}-row limit`);
  }

  const seen = new Set<string>();
  const acceptedIds: string[] = [];
  const rejectedReasons: string[] = [];
  let rejectedCount = 0;

  for (const row of records) {
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
    seen.add(cleaned);
    acceptedIds.push(cleaned);
  }

  return { acceptedIds, rejectedCount, rejectedReasons: rejectedReasons.slice(0, 100) };
}
