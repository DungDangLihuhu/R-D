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
    <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-gray-500">
        {from}–{to} / {total} mục
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Trước
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <span className="sr-only">Chọn trang</span>
          <select
            value={page}
            onChange={(e) => onPageChange(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <option key={p} value={p}>
                Trang {p}/{totalPages}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sau →
        </button>
      </div>
    </div>
  );
}
