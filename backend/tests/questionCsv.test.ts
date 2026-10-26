import { describe, it, expect } from "vitest";
import { parseQuestionsCsv, duplicateKey } from "../src/services/questionCsvService";

function parse(
  csv: string | Buffer,
  over: { defaultTopic?: string; existing?: string[] } = {},
  mime = "text/csv"
) {
  const buffer = typeof csv === "string" ? Buffer.from(csv, "utf8") : csv;
  return parseQuestionsCsv(buffer, mime, {
    defaultTopic: over.defaultTopic ?? "General",
    testTopics: ["Networking", "Databases"],
    existingTexts: new Set((over.existing ?? []).map(duplicateKey)),
  });
}

describe("parseQuestionsCsv: answers and topics", () => {
  it("reads letters, snaps topics to the test's spelling", () => {
    const r = parse(
      "question,A,B,C,D,correct,topic\n" +
        "Which layer routes packets?,Physical,Network,Application,Session,B,Networking\n" +
        "What resolves names?,DNS,FTP,SMTP,SSH,a,databases\n"
    );
    expect(r.rejectedCount).toBe(0);
    expect(r.questions[0]).toMatchObject({ correctOptionIndex: 1, topic: "Networking" });
    expect(r.questions[1]).toMatchObject({ correctOptionIndex: 0, topic: "Databases" });
  });

  it("accepts a number or the exact option text as the answer", () => {
    const r = parse(
      "question,A,B,C,D,correct\n" + "Pick the third?,w,x,y,z,3\n" + "Pick by text?,one,two,three,four,two\n"
    );
    expect(r.questions.map((q) => q.correctOptionIndex)).toEqual([2, 1]);
  });

  it("keeps a letter pointing at its own column when an option is blank", () => {
    const r = parse(
      "question,A,B,C,D,correct\n" + "Gap in options?,A1,,C1,D1,C\n" + "Points at the gap?,A1,,C1,D1,B\n"
    );
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].options).toEqual(["A1", "C1", "D1"]);
    expect(r.questions[0].correctOptionIndex).toBe(1); // "C1"
    expect(r.rejectedReasons[0]).toMatch(/Row 3: .*empty option/);
  });

  it("uses the default topic when there is no topic column or the cell is blank", () => {
    const noColumn = parse("question,A,B,correct\nWhat is it?,x,y,A\n", { defaultTopic: "Networking" });
    expect(noColumn.questions[0].topic).toBe("Networking");

    const blank = parse("question,A,B,correct,topic\nWhat is it?,x,y,A,\n", { defaultTopic: "Databases" });
    expect(blank.questions[0].topic).toBe("Databases");
  });

  it("understands common header names", () => {
    const r = parse("Question Text,Option A,Option B,Correct Answer\nWhat is it?,x,y,B\n");
    expect(r.questions[0]).toMatchObject({ options: ["x", "y"], correctOptionIndex: 1 });
  });
});

describe("parseQuestionsCsv: bad rows", () => {
  it("skips bad rows with a row number and reason, and keeps the good ones", () => {
    const r = parse(
      [
        "question,A,B,C,D,correct",
        ",a,b,c,d,A", // 2: no question
        "Only one option?,x,,,,A", // 3
        "Bad letter?,a,b,c,d,Z", // 4
        'Two answers?,a,b,c,d,"A,C"', // 5
        "Same options?,a,A,c,d,A", // 6
        "Fine one?,a,b,c,d,D", // 7: accepted
      ].join("\n")
    );
    expect(r.questions).toHaveLength(1);
    expect(r.rejectedCount).toBe(5);
    expect(r.rejectedReasons.map((x) => x.slice(0, 6))).toEqual(["Row 2:", "Row 3:", "Row 4:", "Row 5:", "Row 6:"]);
  });

  it("skips duplicates within the file and of existing questions, ignoring case and spacing", () => {
    const r = parse(
      "question,A,B,correct\n" +
        "What  is IT?,x,y,A\n" +
        "what is it?,x,y,A\n" +
        "Already there?,x,y,A\n",
      { existing: ["ALREADY THERE?"] }
    );
    expect(r.questions).toHaveLength(1);
    expect(r.rejectedReasons.every((x) => /duplicate/.test(x))).toBe(true);
  });

  it("ignores rows of empty cells", () => {
    const r = parse("question,A,B,correct\nReal one?,x,y,A\n,,,\n");
    expect(r.questions).toHaveLength(1);
    expect(r.rejectedCount).toBe(0);
  });
});

describe("parseQuestionsCsv: file formats", () => {
  it("handles semicolon-separated files, quoted commas and line breaks, and a BOM", () => {
    const semi = parse("\uFEFFquestion;A;B;correct\nHello there?;x;y;B\n");
    expect(semi.questions[0].correctOptionIndex).toBe(1);

    const quoted = parse('question,A,B,correct\n"What is 1,2?\nExplain.",x,y,A\n');
    expect(quoted.questions[0].text).toBe("What is 1,2?\nExplain.");
  });

  it("rejects a file it cannot understand, with a clear message", () => {
    expect(() => parse("name,age\nBo,3\n")).toThrow(/Could not find the columns/);
    expect(() => parse("question,A,B,correct\n")).toThrow(/at least one question row/);
    expect(() => parse("a,b\n", {}, "application/pdf")).toThrow(/\.csv/);
    expect(() => parse(Buffer.from([0x71, 0x2c, 0xe9, 0x0a, 0x71]))).toThrow(/UTF-8/);
  });

  it("rejects oversized files and files with too many rows", () => {
    expect(() => parse(Buffer.alloc(1024 * 1024 + 1, "a"))).toThrow(/1MB/);
    const rows = Array.from({ length: 501 }, (_, i) => `Question number ${i}?,x,y,A`).join("\n");
    expect(() => parse("question,A,B,correct\n" + rows)).toThrow(/more than 500/);
  });
});