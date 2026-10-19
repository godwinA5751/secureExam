import { describe, it, expect } from "vitest";
import { parseRosterCsv } from "../src/services/csvService";

const parse = (csv: string) => parseRosterCsv(Buffer.from(csv, "utf8"), "text/csv");

describe("parseRosterCsv", () => {
  it("still accepts ID-only files", () => {
    const r = parse("CSC/2021/001\nCSC/2021/002\n");
    expect(r.acceptedIds).toEqual(["CSC/2021/001", "CSC/2021/002"]);
    expect(r.acceptedStudents.every((s) => s.name === "")).toBe(true);
    expect(r.rejectedCount).toBe(0);
  });

  it("reads names from the second column", () => {
    const r = parse("CSC/2021/001,Ngozi Okafor\nCSC/2021/002,O'Neil Smith\n");
    expect(r.acceptedStudents).toEqual([
      { idNumber: "CSC/2021/001", name: "Ngozi Okafor" },
      { idNumber: "CSC/2021/002", name: "O'Neil Smith" },
    ]);
  });

  it("skips a header row without counting it as a rejection", () => {
    const r = parse("idNumber,name\nCSC/2021/001,Ngozi Okafor\n");
    expect(r.acceptedIds).toEqual(["CSC/2021/001"]);
    expect(r.rejectedCount).toBe(0);
  });

  it("handles quoted names that contain commas", () => {
    const r = parse('CSC/2021/003,"Adeyemi, Tunde"\n');
    expect(r.acceptedStudents[0].name).toBe("Adeyemi, Tunde");
  });

  it("keeps the ID but drops an unsupported name", () => {
    const r = parse("CSC/2021/004,=cmd|calc\n");
    expect(r.acceptedIds).toEqual(["CSC/2021/004"]);
    expect(r.acceptedStudents[0].name).toBe("");
    expect(r.ignoredNameCount).toBe(1);
  });

  it("strips leading formula characters from names", () => {
    const r = parse("CSC/2021/005,-Ada Obi\n");
    expect(r.acceptedStudents[0].name).toBe("Ada Obi");
  });

  it("still rejects bad and duplicate IDs", () => {
    const r = parse("CSC/2021/006,Ada\nCSC/2021/006,Ada Again\nab,Too Short\n");
    expect(r.acceptedIds).toEqual(["CSC/2021/006"]);
    expect(r.rejectedCount).toBe(2);
  });
});