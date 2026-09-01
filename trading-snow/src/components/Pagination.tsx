"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationProps) {
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--app-border)" }}>
      <p className="text-xs text-app-muted">
        {from}–{to} / {total} mục
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="app-btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Trước
        </button>
        <label className="flex items-center gap-1.5 text-sm text-app-muted">
          <span className="sr-only">Số trang</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 1) onPageChange(next);
            }}
            className="app-input w-16 px-2 py-1.5 text-center tabular-nums"
          />
          <span className="tabular-nums">/ {totalPages}</span>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="app-btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sau →
        </button>
      </div>
    </div>
  );
}
