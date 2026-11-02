import { describe, it, expect, afterEach } from "vitest";
import { envNumber } from "../src/utils/env";

const NAME = "SOME_TEST_SETTING";
afterEach(() => {
  delete process.env[NAME];
});

describe("envNumber", () => {
  it("uses the default when the setting is missing, blank or not a usable number", () => {
    expect(envNumber(NAME, 30)).toBe(30);
    for (const bad of ["", "   ", "abc", "-5", "NaN", "Infinity"]) {
      process.env[NAME] = bad;
      expect(envNumber(NAME, 30)).toBe(30);
    }
  });

  it("uses a real value, including an explicit 0", () => {
    process.env[NAME] = "12";
    expect(envNumber(NAME, 30)).toBe(12);
    process.env[NAME] = "0";
    expect(envNumber(NAME, 30)).toBe(0);
  });
});