import { fetchChartHistory } from "@/lib/chart-history";
import { computeWyckoff } from "@/lib/indicators/ben-dang/wyckoff";
import { toBars } from "@/lib/indicators/ben-dang/utils";
import { cacheKey, cached } from "@/lib/server-cache";
import {
  SIGNAL_TIMEFRAMES,
  wyckoffBuyHit,
  type SignalTimeframe,
  type WyckoffBuyHit,
} from "@/lib/signals";

export interface HoldingSignal {
  symbol: string;
  marketPrice: number;
  hits: WyckoffBuyHit[];
}

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

async function history(symbol: string, timeframe: SignalTimeframe) {
  return cached(cacheKey(["wyckoff-hist", symbol, timeframe]), 180_000, () =>
    fetchChartHistory(symbol, timeframe)
  );
}

async function scanSymbol(
  symbol: string,
  quotedPrice: number
): Promise<HoldingSignal | null> {
  try {
    let marketPrice = quotedPrice;
    if (!(marketPrice > 0)) {
      const daily = await history(symbol, "1d");
      marketPrice = daily[daily.length - 1]?.close ?? 0;
    }
    if (!(marketPrice > 0)) return null;

    const hits: WyckoffBuyHit[] = [];
    for (const timeframe of SIGNAL_TIMEFRAMES) {
      try {
        const points = await history(symbol, timeframe);
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
    return { symbol, marketPrice, hits };
  } catch {
    return null;
  }
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
    .sort((a, b) => Math.abs(a.hits[0].distPct) - Math.abs(b.hits[0].distPct));
}
