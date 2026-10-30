export type WindowState = "draft" | "scheduled" | "open" | "closed";

/** Where a test is in its life, worked out from its real dates (not the stored `window` flag). */
export function windowStateOf(
  test: { status: string; loginWindowStart?: Date | null; loginWindowEnd?: Date | null },
  now: Date = new Date()
): WindowState {
  if (test.status !== "published") return "draft";
  if (test.loginWindowStart && now < test.loginWindowStart) return "scheduled";
  if (test.loginWindowEnd && now > test.loginWindowEnd) return "closed";
  return "open";
}