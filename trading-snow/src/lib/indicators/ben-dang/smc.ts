import type {
  Bar,
  EqualLevel,
  FairValueGap,
  OrderBlock,
  PremiumDiscountZone,
  SmcResult,
  SmcStructureLine,
  SwingPoint,
} from "./types";
import { atr, bodySize, findPivotHighs, findPivotLows, isBullish } from "./utils";

export function computeSmc(bars: Bar[], swingLength = 5): SmcResult {
  const empty: SmcResult = {
    structureLines: [],
    orderBlocks: [],
    fairValueGaps: [],
    equalLevels: [],
    swingHighs: [],
    swingLows: [],
  };
  if (bars.length < swingLength * 2 + 5) return empty;

  const atrValues = atr(bars);
  const swingHighs = findPivotHighs(bars, swingLength, swingLength);
  const swingLows = findPivotLows(bars, swingLength, swingLength);

  const structureLines = detectStructure(bars, swingHighs, swingLows);
  const orderBlocks = detectOrderBlocks(bars, atrValues);
  const fairValueGaps = detectFairValueGaps(bars);
  const equalLevels = detectEqualLevels(swingHighs, swingLows, atrValues);
  const premiumDiscount = detectPremiumDiscount(swingHighs, swingLows);

  return {
    structureLines,
    orderBlocks,
    fairValueGaps,
    equalLevels,
    premiumDiscount,
    swingHighs,
    swingLows,
  };
}

function detectStructure(
  bars: Bar[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[]
): SmcStructureLine[] {
  const lines: SmcStructureLine[] = [];
  const swings = [
    ...swingHighs.map((s) => ({ ...s, kind: "high" as const })),
    ...swingLows.map((s) => ({ ...s, kind: "low" as const })),
  ].sort((a, b) => a.index - b.index);

  if (swings.length < 3) return lines;

  let trend: "bullish" | "bearish" | null = null;
  let lastHigh = swingHighs[0];
  let lastLow = swingLows[0];

  for (let i = 1; i < swings.length; i++) {
    const s = swings[i];
    if (s.kind === "high") {
      if (lastHigh && s.price > lastHigh.price) {
        const type = trend === "bearish" ? "choch" : "bos";
        lines.push({
          fromIndex: lastHigh.index,
          toIndex: s.index,
          price: lastHigh.price,
          type,
          direction: "bullish",
        });
        trend = "bullish";
      } else if (lastHigh && s.price < lastHigh.price && trend === "bullish") {
        lines.push({
          fromIndex: lastHigh.index,
          toIndex: s.index,
          price: lastHigh.price,
          type: "choch",
          direction: "bearish",
        });
        trend = "bearish";
      }
      lastHigh = s;
    } else {
      if (lastLow && s.price < lastLow.price) {
        const type = trend === "bullish" ? "choch" : "bos";
        lines.push({
          fromIndex: lastLow.index,
          toIndex: s.index,
          price: lastLow.price,
          type,
          direction: "bearish",
        });
        trend = "bearish";
      } else if (lastLow && s.price > lastLow.price && trend === "bearish") {
        lines.push({
          fromIndex: lastLow.index,
          toIndex: s.index,
          price: lastLow.price,
          type: "choch",
          direction: "bullish",
        });
        trend = "bullish";
      }
      lastLow = s;
    }
  }

  return lines.slice(-12);
}

function detectOrderBlocks(bars: Bar[], atrValues: number[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const minBody = 1.2;

  for (let i = 2; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const atrVal = atrValues[i] || atrValues[i - 1] || 1;
    const displacement = bodySize(bar) > atrVal * minBody;

    if (!displacement) continue;

    if (isBullish(bar) && !isBullish(prev)) {
      blocks.push({
        startIndex: i - 1,
        endIndex: i,
        high: prev.high,
        low: prev.low,
        type: "bullish",
      });
    } else if (!isBullish(bar) && isBullish(prev)) {
      blocks.push({
        startIndex: i - 1,
        endIndex: i,
        high: prev.high,
        low: prev.low,
        type: "bearish",
      });
    }
  }

  return blocks.slice(-8);
}

function detectFairValueGaps(bars: Bar[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];

  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];

    if (c1.high < c3.low) {
      gaps.push({
        startIndex: i - 2,
        endIndex: i,
        top: c3.low,
        bottom: c1.high,
        type: "bullish",
      });
    }
    if (c1.low > c3.high) {
      gaps.push({
        startIndex: i - 2,
        endIndex: i,
        top: c1.low,
        bottom: c3.high,
        type: "bearish",
      });
    }
  }

  return gaps.slice(-10);
}

function detectEqualLevels(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  atrValues: number[]
): EqualLevel[] {
  const levels: EqualLevel[] = [];
  const avgAtr = atrValues.filter((v) => v > 0).reduce((a, b) => a + b, 0) / (atrValues.length || 1);
  const tolerance = avgAtr * 0.15;

  for (let i = 0; i < swingHighs.length - 1; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (Math.abs(swingHighs[i].price - swingHighs[j].price) <= tolerance) {
        levels.push({
          index1: swingHighs[i].index,
          index2: swingHighs[j].index,
          price: (swingHighs[i].price + swingHighs[j].price) / 2,
          type: "eqh",
        });
      }
    }
  }

  for (let i = 0; i < swingLows.length - 1; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      if (Math.abs(swingLows[i].price - swingLows[j].price) <= tolerance) {
        levels.push({
          index1: swingLows[i].index,
          index2: swingLows[j].index,
          price: (swingLows[i].price + swingLows[j].price) / 2,
          type: "eql",
        });
      }
    }
  }

  return levels.slice(-6);
}

function detectPremiumDiscount(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[]
): PremiumDiscountZone | undefined {
  if (!swingHighs.length || !swingLows.length) return undefined;

  const recentHigh = swingHighs[swingHighs.length - 1];
  const recentLow = swingLows[swingLows.length - 1];
  const top = recentHigh.price;
  const bottom = recentLow.price;
  if (top <= bottom) return undefined;

  return {
    top,
    bottom,
    equilibrium: (top + bottom) / 2,
    swingHighIndex: recentHigh.index,
    swingLowIndex: recentLow.index,
  };
}
