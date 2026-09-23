"use client";

import { fetchJson } from "./fetch-cache";
import type { FxLookup } from "./fx";

/** /api/fx nhận tối đa 40 mã mỗi lần. */
const FX_BATCH = 40;

/** Tiền tệ niêm yết của các mã và tỷ giá ra USD (theo ngày từ `from`, không có thì tuần gần nhất). */
export async function fetchFxLookup(symbols: string[], from?: string): Promise<FxLookup> {
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += FX_BATCH) batches.push(symbols.slice(i, i + FX_BATCH));
  const parts = await Promise.all(
    batches.map((batch) => {
      const params = new URLSearchParams({ symbols: batch.join(",") });
      if (from) params.set("from", from);
      return fetchJson<FxLookup>(`/api/fx?${params}`, { ttlMs: 30 * 60 * 1000 });
    })
  );
  return {
    currencies: Object.assign({}, ...parts.map((p) => p.currencies ?? {})),
    rates: Object.assign({}, ...parts.map((p) => p.rates ?? {})),
  };
}
