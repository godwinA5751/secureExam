/** Reads ?page=&pageSize= safely: junk becomes the defaults, and page size is capped. */
export function parsePaging(query: Record<string, unknown>, defaultSize: number, maxSize: number) {
  const toInt = (v: unknown) => Number.parseInt(String(v ?? ""), 10);
  const page = Math.min(100_000, Math.max(1, toInt(query.page) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, toInt(query.pageSize) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}