import type { Bar, SrLevel, SrResult } from "./types";
import { atr, clusterPrices, findPivotHighs, findPivotLows } from "./utils";

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

  const levels: SrLevel[] = [];

  for (const c of resistanceClusters.slice(0, maxLevels)) {
    levels.push({
      price: c.price,
      type: c.price >= currentPrice ? "resistance" : "support",
      strength: Math.min(c.count / 3, 1),
      touches: c.count,
    });
  }

  for (const c of supportClusters.slice(0, maxLevels)) {
    levels.push({
      price: c.price,
      type: c.price <= currentPrice ? "support" : "resistance",
      strength: Math.min(c.count / 3, 1),
      touches: c.count,
    });
  }

  const unique = new Map<number, SrLevel>();
  for (const l of levels) {
    const key = Math.round(l.price * 100);
    const existing = unique.get(key);
    if (!existing || l.touches > existing.touches) {
      unique.set(key, l);
    }
  }

  const sorted = [...unique.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "support" ? -1 : 1;
    if (a.type === "support") return b.price - a.price;
    return a.price - b.price;
  });

  return { levels: sorted.slice(0, maxLevels) };
}
