import { fetchFullChartHistory, limitChartBars } from "@/lib/chart-history";
import { computeWyckoff } from "@/lib/indicators/ben-dang/wyckoff";
import { toBars } from "@/lib/indicators/ben-dang/utils";
import { cacheKey, cached } from "@/lib/server-cache";
import {
  SIGNAL_TIMEFRAMES,
  dailyTrend,
  isActionableHit,
  wyckoffBuyHit,
  type HoldingSignal,
  type SignalTimeframe,
  type WyckoffBuyHit,
} from "@/lib/signals";

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(Math.max(limit, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/** Cả khoảng Yahoo (1D = 1 năm) để đủ 200 phiên cho SMA200; Wyckoff vẫn chạy trên phần hiển thị. */
async function history(symbol: string, timeframe: SignalTimeframe) {
  return cached(cacheKey(["wyckoff-hist", symbol, timeframe]), 180_000, () =>
    fetchFullChartHistory(symbol, timeframe)
  );
}

async function scanSymbol(
  symbol: string,
  quotedPrice: number
): Promise<HoldingSignal | null> {
  try {
    const daily = await history(symbol, "1d").catch(() => []);
    let marketPrice = quotedPrice;
    if (!(marketPrice > 0)) marketPrice = daily[daily.length - 1]?.close ?? 0;
    if (!(marketPrice > 0)) return null;

    const hits: WyckoffBuyHit[] = [];
    for (const timeframe of SIGNAL_TIMEFRAMES) {
      try {
        // Cùng số nến với biểu đồ trang Phân tích để mốc hai trang khớp nhau.
        const points = limitChartBars(await history(symbol, timeframe), timeframe);
        if (points.length < 20) continue;
        const result = computeWyckoff(toBars(points), timeframe);
        const hit = wyckoffBuyHit(result, marketPrice, timeframe);
        if (hit) hits.push(hit);
      } catch {
        // Skip a timeframe that failed to load; other TFs can still hit.
      }
    }

    hits.sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct));
    if (!hits.length) return null;
    const trend = dailyTrend(
      daily.map((p) => p.close),
      marketPrice
    );
    return { symbol, marketPrice, hits, trend };
  } catch {
    return null;
  }
}

function rank(signal: HoldingSignal): number {
  return signal.hits.some((h) => isActionableHit(h, signal.trend.state)) ? 0 : 1;
}

export async function scanWyckoffSignals(
  symbols: string[],
  prices: Record<string, number>
): Promise<HoldingSignal[]> {
  const unique = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => s && s !== "CASH")),
  ];
  const scanned = await mapPool(unique, 3, async (symbol) => {
    const marketPrice = prices[symbol] ?? 0;
    return scanSymbol(symbol, marketPrice);
  });

  return scanned
    .filter((row): row is HoldingSignal => row != null)
    .sort(
      (a, b) =>
        rank(a) - rank(b) || Math.abs(a.hits[0].distPct) - Math.abs(b.hits[0].distPct)
    );
}
