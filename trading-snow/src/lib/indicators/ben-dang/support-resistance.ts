import type { Bar, SrLevel, SrResult } from "./types";
import { atr, clusterPrices, findPivotHighs, findPivotLows } from "./utils";

function toLevel(
  price: number,
  type: SrLevel["type"],
  touches: number
): SrLevel {
  return {
    price,
    type,
    strength: Math.min(touches / 3, 1),
    touches,
  };
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
  const tolerance = lastAtr * 0.35;

  const pivotHighs = findPivotHighs(bars, effectivePeriod, effectivePeriod);
  const pivotLows = findPivotLows(bars, effectivePeriod, effectivePeriod);
  const currentPrice = bars[bars.length - 1].close;
  const minGap = Math.max(lastAtr * 0.08, currentPrice * 0.0008);
  const perSide = Math.max(1, Math.ceil(maxLevels / 2));

  const resistanceClusters = clusterPrices(
    pivotHighs.map((p) => p.price),
    tolerance
  );
  const supportClusters = clusterPrices(
    pivotLows.map((p) => p.price),
    tolerance
  );

  const resistances = resistanceClusters
    .map((c) => toLevel(c.price, "resistance", c.count))
    .filter((l) => l.price > currentPrice + minGap)
    .sort((a, b) => a.price - b.price)
    .slice(0, perSide);

  const supports = supportClusters
    .map((c) => toLevel(c.price, "support", c.count))
    .filter((l) => l.price < currentPrice - minGap)
    .sort((a, b) => b.price - a.price)
    .slice(0, perSide);

  if (!resistances.length) {
    const fallback = resistanceClusters
      .map((c) => toLevel(c.price, "resistance", c.count))
      .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
      .slice(0, 1);
    resistances.push(...fallback);
  }

  if (!supports.length) {
    const fallback = supportClusters
      .map((c) => toLevel(c.price, "support", c.count))
      .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
      .slice(0, 1);
    supports.push(...fallback);
  }

  return {
    levels: [
      ...supports.sort((a, b) => b.price - a.price),
      ...resistances.sort((a, b) => a.price - b.price),
    ],
  };
}
