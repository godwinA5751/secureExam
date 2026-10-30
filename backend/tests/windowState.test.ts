import { describe, it, expect } from "vitest";
import { windowStateOf } from "../src/services/windowState";

const NOW = new Date("2026-11-01T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);

describe("windowStateOf", () => {
  it("is draft until the test is published, whatever the dates say", () => {
    expect(windowStateOf({ status: "draft", loginWindowStart: hours(-1), loginWindowEnd: hours(1) }, NOW)).toBe("draft");
  });

  it("is scheduled between publishing and the start time", () => {
    expect(windowStateOf({ status: "published", loginWindowStart: hours(2), loginWindowEnd: hours(5) }, NOW)).toBe("scheduled");
  });

  it("uses an inclusive start time and exclusive end time", () => {
    expect(
      windowStateOf(
        {
          status: "published",
          loginWindowStart: hours(-1),
          loginWindowEnd: hours(1),
        },
        NOW
      )
    ).toBe("open");

    // Exactly at the start: open.
    expect(
      windowStateOf(
        {
          status: "published",
          loginWindowStart: NOW,
          loginWindowEnd: hours(1),
        },
        NOW
      )
    ).toBe("open");

    // Exactly at the end: closed.
    expect(
      windowStateOf(
        {
          status: "published",
          loginWindowStart: hours(-1),
          loginWindowEnd: NOW,
        },
        NOW
      )
    ).toBe("closed");
  });

  it("is closed once the end time has passed", () => {
    expect(windowStateOf({ status: "published", loginWindowStart: hours(-5), loginWindowEnd: hours(-1) }, NOW)).toBe("closed");
  });
});