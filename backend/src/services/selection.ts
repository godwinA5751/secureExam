/** Fisher-Yates shuffle. `rand` is injectable so tests can be deterministic. */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks n items so every topic is represented as evenly as possible: shuffle each
 * topic's questions, then deal one from each topic in turn. Topics are visited in
 * random order, so who gets the "extra" question differs from student to student.
 */
export function pickBalanced<T extends { topic?: string }>(
  items: T[],
  n: number,
  rand: () => number = Math.random
): T[] {
  if (n >= items.length) return [...items];
  if (n <= 0) return [];

  const byTopic = new Map<string, T[]>();
  for (const item of items) {
    const key = item.topic ?? "";
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(item);
  }

  const groups = shuffled([...byTopic.values()].map((g) => shuffled(g, rand)), rand);
  const picked: T[] = [];
  while (picked.length < n) {
    for (const group of groups) {
      if (picked.length >= n) break;
      const next = group.pop();
      if (next !== undefined) picked.push(next);
    }
  }
  return picked;
}