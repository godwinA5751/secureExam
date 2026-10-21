import { describe, it, expect } from "vitest";
import { pickBalanced } from "../src/services/selection";

// Small deterministic random number generator so these tests never flake.
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const make = (topic: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `${topic}${i}`, topic }));

describe("pickBalanced", () => {
  const pool = [...make("A", 10), ...make("B", 10), ...make("C", 10)];
  const share = (picked: { topic: string }[], topic: string) =>
    picked.filter((p) => p.topic === topic).length;

  it("returns everything when asked for at least the pool size", () => {
    expect(pickBalanced(pool, 30)).toHaveLength(30);
    expect(pickBalanced(pool, 99)).toHaveLength(30);
  });

  it("returns exactly n distinct questions", () => {
    const picked = pickBalanced(pool, 12, seeded(1));
    expect(picked).toHaveLength(12);
    expect(new Set(picked.map((p) => p.id)).size).toBe(12);
  });

  it("splits evenly across topics", () => {
    const picked = pickBalanced(pool, 9, seeded(2));
    expect([share(picked, "A"), share(picked, "B"), share(picked, "C")]).toEqual([3, 3, 3]);
  });

  it("keeps topic shares within one of each other when it does not divide evenly", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const picked = pickBalanced(pool, 10, seeded(seed));
      const shares = ["A", "B", "C"].map((t) => share(picked, t)).sort();
      expect(shares).toEqual([3, 3, 4]);
    }
  });

  it("fills from the larger topics when a small topic runs out", () => {
    const uneven = [...make("A", 1), ...make("B", 10)];
    const picked = pickBalanced(uneven, 5, seeded(3));
    expect(share(picked, "A")).toBe(1);
    expect(share(picked, "B")).toBe(4);
  });

  it("gives different students different questions", () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 15; seed++) {
      sets.add(pickBalanced(pool, 9, seeded(seed)).map((p) => p.id).sort().join(","));
    }
    expect(sets.size).toBeGreaterThan(10);
  });

  it("is repeatable for the same random sequence", () => {
    const a = pickBalanced(pool, 9, seeded(7)).map((p) => p.id);
    const b = pickBalanced(pool, 9, seeded(7)).map((p) => p.id);
    expect(a).toEqual(b);
  });
});