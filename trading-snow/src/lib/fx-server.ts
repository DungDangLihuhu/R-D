import { cacheKey, cached } from "./server-cache";
import type { FxSeries } from "./fx";
import { fetchCloseHistory, fetchListingCurrency } from "./yahoo";

/**
 * Số USD cho 1 đơn vị `base` theo ngày. Yahoo có cặp BASEUSD=X cho các đồng mạnh; đồng
 * yếu (VND…) chỉ có chiều USD→base (BASE=X) nên đảo ngược.
 */
async function loadFxSeries(base: string, from: Date, to: Date): Promise<FxSeries> {
  const direct = await fetchCloseHistory(`${base}USD=X`, from, to);
  if (direct.points.length > 0) {
    return { current: direct.points[direct.points.length - 1].close, points: direct.points };
  }
  const inverse = await fetchCloseHistory(`${base}=X`, from, to);
  const points = inverse.points
    .filter((p) => p.close > 0)
    .map((p) => ({ date: p.date, close: 1 / p.close }));
  if (points.length === 0) throw new Error(`no fx for ${base}`);
  return { current: points[points.length - 1].close, points };
}

/** Tỷ giá theo ngày từ `fromDay` tới hôm nay (điểm cuối là tỷ giá hiện tại). Null khi Yahoo không có. */
export async function fxSeries(base: string, fromDay: string): Promise<FxSeries | null> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    // Lỗi thì ném ra để cache không nhớ kết quả rỗng — lần sau còn thử lại.
    return await cached(cacheKey(["fx", base, fromDay, today]), 30 * 60_000, () =>
      loadFxSeries(base, new Date(`${fromDay}T00:00:00Z`), new Date())
    );
  } catch {
    return null;
  }
}

export async function listingCurrency(symbol: string): Promise<string | null> {
  try {
    return await cached(cacheKey(["listing-currency", symbol]), 24 * 3600_000, async () => {
      const currency = await fetchListingCurrency(symbol);
      if (!currency) throw new Error(`no currency for ${symbol}`);
      return currency;
    });
  } catch {
    return null;
  }
}

/** Chạy `fn` cho từng phần tử, tối đa `limit` việc cùng lúc. */
export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
