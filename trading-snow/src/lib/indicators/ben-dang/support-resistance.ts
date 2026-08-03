import type { Bar, SrLevel, SrResult } from "./types";
import { atr, clusterPrices, findPivotHighs, findPivotLows } from "./utils";

function dedupeLevels(levels: SrLevel[]): SrLevel[] {
  const unique = new Map<number, SrLevel>();
  for (const l of levels) {
    const key = Math.round(l.price * 100);
    const existing = unique.get(key);
    if (!existing || l.touches > existing.touches) {
      unique.set(key, l);
    }
  }
  return [...unique.values()];
}

function clustersToLevels(
  clusters: { price: number; count: number }[],
  origin: "high" | "low",
  currentPrice: number,
  minGap: number
): SrLevel[] {
  return clusters
    .map((c): SrLevel => ({
      price: c.price,
      type:
        origin === "high"
          ? c.price >= currentPrice
            ? "resistance"
            : "support"
          : c.price <= currentPrice
            ? "support"
            : "resistance",
      strength: Math.min(c.count / 3, 1),
      touches: c.count,
    }))
    .filter((l) => Math.abs(l.price - currentPrice) >= minGap);
}

/** Nearest levels first (TradingView-style), stronger clusters as tie-break. */
function pickNearest(
  levels: SrLevel[],
  type: SrLevel["type"],
  currentPrice: number,
  limit: number
): SrLevel[] {
  return levels
    .filter((l) => l.type === type)
    .sort((a, b) => {
      const distA = Math.abs(a.price - currentPrice);
      const distB = Math.abs(b.price - currentPrice);
      if (distA !== distB) return distA - distB;
      if (b.touches !== a.touches) return b.touches - a.touches;
      return type === "support" ? b.price - a.price : a.price - b.price;
    })
    .slice(0, limit);
}

export function computeSupportResistance(
  bars: Bar[],
  period = 10,
  maxLevels = 5
): SrResult {
  const effectivePeriod = Math.max(2, Math.min(period, Math.floor((bars.length - 1) / 2)));
  if (bars.length < effectivePeriod * 2 + 1) return { levels: [] };

  const atrValues = atr(bars);
  const lastAtr = atrValues[atrValues.length - 1] || 1;
  const tolerance = lastAtr * 0.4;

  const pivotHighs = findPivotHighs(bars, effectivePeriod, effectivePeriod);
  const pivotLows = findPivotLows(bars, effectivePeriod, effectivePeriod);

  const resistanceClusters = clusterPrices(
    pivotHighs.map((p) => p.price),
    tolerance
  );
  const supportClusters = clusterPrices(
    pivotLows.map((p) => p.price),
    tolerance
  );

  const currentPrice = bars[bars.length - 1].close;
  const minGap = Math.max(lastAtr * 0.1, currentPrice * 0.001);
  const perSide = Math.max(1, Math.ceil(maxLevels / 2));

  const merged = dedupeLevels([
    ...clustersToLevels(resistanceClusters, "high", currentPrice, minGap),
    ...clustersToLevels(supportClusters, "low", currentPrice, minGap),
  ]);

  const supports = pickNearest(merged, "support", currentPrice, perSide);
  const resistances = pickNearest(merged, "resistance", currentPrice, perSide);

  return {
    levels: [
      ...supports.sort((a, b) => b.price - a.price),
      ...resistances.sort((a, b) => a.price - b.price),
    ],
  };
}
