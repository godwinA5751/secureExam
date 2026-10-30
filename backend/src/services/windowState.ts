export type WindowState = "draft" | "scheduled" | "open" | "closed";

/**
 * Determines a test's effective window state from its publication status
 * and scheduled dates, not the stored `window` flag.
 */
export function windowStateOf(
  test: {
    status: string;
    loginWindowStart?: Date | null;
    loginWindowEnd?: Date | null;
  },
  now: Date = new Date()
): WindowState {
  if (test.status !== "published") return "draft";

  // The test has not reached its scheduled start time.
  if (test.loginWindowStart && now < test.loginWindowStart) {
    return "scheduled";
  }

  // The end time is exclusive.
  if (test.loginWindowEnd && now >= test.loginWindowEnd) {
    return "closed";
  }

  return "open";
}