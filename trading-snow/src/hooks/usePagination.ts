"use client";

import { useMemo, useState } from "react";

export const PAGE_SIZE = 20;

export function usePagination<T>(items: T[], resetDeps: unknown[] = []) {
  const resetKey = useMemo(
    () => [items.length, ...resetDeps].map(String).join("\0"),
    [items.length, resetDeps]
  );
  const [pageByKey, setPageByKey] = useState<Record<string, number>>({});

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(pageByKey[resetKey] ?? 1, totalPages);

  const setPage = (next: number) => {
    const safe = Math.min(Math.max(1, next), totalPages);
    setPageByKey((prev) => ({ ...prev, [resetKey]: safe }));
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
