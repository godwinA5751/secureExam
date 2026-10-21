type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

/** 1 … 4 5 6 … 20: always the first, last and current page, with its neighbours. */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({ page, totalPages, total, pageSize, onPageChange, disabled }: Props) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const btn =
    "min-w-8 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-400">
        Showing {from}–{to} of {total}
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || page <= 1}
            className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            Previous
          </button>

          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                disabled={disabled}
                aria-current={p === page ? "page" : undefined}
                className={`${btn} ${
                  p === page
                    ? "border-violet-600 bg-violet-600 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= totalPages}
            className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}