"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 20;

export function usePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [items.length, ...resetDeps]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
