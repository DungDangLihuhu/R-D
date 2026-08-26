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

function dedupeNear(levels: SrLevel[], tolerance: number): SrLevel[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const out: SrLevel[] = [];
  for (const level of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(level.price - last.price) <= tolerance) {
      if (level.touches > last.touches || (level.touches === last.touches && level.type === last.type)) {
        out[out.length - 1] = level;
      }
    } else {
      out.push(level);
    }
  }
  return out;
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
    tolerance,
    lastAtr * 1.2
  );
  const supportClusters = clusterPrices(
    pivotLows.map((p) => p.price),
    tolerance,
    lastAtr * 1.2
  );

  // Role flip: broken resistance (pivot high below price) becomes support, and vice versa.
  const flipped: SrLevel[] = [
    ...resistanceClusters.map((c) =>
      toLevel(c.price, c.price > currentPrice ? "resistance" : "support", c.count)
    ),
    ...supportClusters.map((c) =>
      toLevel(c.price, c.price < currentPrice ? "support" : "resistance", c.count)
    ),
  ].filter((l) => Math.abs(l.price - currentPrice) >= minGap);

  const candidates = dedupeNear(flipped, tolerance);

  let resistances = candidates
    .filter((l) => l.type === "resistance" && l.price > currentPrice + minGap)
    .sort((a, b) => a.price - b.price)
    .slice(0, perSide);

  let supports = candidates
    .filter((l) => l.type === "support" && l.price < currentPrice - minGap)
    .sort((a, b) => b.price - a.price)
    .slice(0, perSide);

  // Unconfirmed extreme in the last pivot window (crash/rally before fractal confirms).
  const recent = bars.slice(-Math.max(effectivePeriod * 2, 8));
  const recentLow = Math.min(...recent.map((b) => b.low));
  const recentHigh = Math.max(...recent.map((b) => b.high));

  if (!supports.length && recentLow < currentPrice - minGap) {
    supports = [toLevel(recentLow, "support", 1)];
  }
  if (!resistances.length && recentHigh > currentPrice + minGap) {
    resistances = [toLevel(recentHigh, "resistance", 1)];
  }

  return {
    levels: [
      ...supports.sort((a, b) => b.price - a.price),
      ...resistances.sort((a, b) => a.price - b.price),
    ],
  };
}
