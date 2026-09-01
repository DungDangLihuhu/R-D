"use client";

import { useMemo, useState } from "react";

export const PAGE_SIZE = 20;

export function usePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const resetKey = resetDeps.map(String).join("\0");
  const [saved, setSaved] = useState({ key: resetKey, page: 1 });

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // Đổi bộ lọc / portfolio thì về trang 1; xóa một hàng thì giữ nguyên trang.
  const page = Math.min(saved.key === resetKey ? saved.page : 1, totalPages);

  const setPage = (next: number) => {
    setSaved({ key: resetKey, page: Math.min(Math.max(1, next), totalPages) });
  };

  const pageItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page]
  );

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    pageSize: PAGE_SIZE,
    total: items.length,
  };
}
