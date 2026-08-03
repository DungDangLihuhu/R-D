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
import {
  atr,
  findPivotHighs,
  findPivotLows,
  isBullish,
  isPivotHighAt,
  isPivotLowAt,
} from "./utils";

const INTERNAL_SWING = 5;

export function computeSmc(bars: Bar[], swingLength = 50): SmcResult {
  const empty: SmcResult = {
    structureLines: [],
    orderBlocks: [],
    fairValueGaps: [],
    equalLevels: [],
    swingHighs: [],
    swingLows: [],
  };
  if (bars.length < swingLength * 2 + 5) return empty;

  const swingLen = Math.max(5, Math.min(swingLength, Math.floor(bars.length / 3)));
  const swingHighs = findPivotHighs(bars, swingLen, swingLen);
  const swingLows = findPivotLows(bars, swingLen, swingLen);

  const swingStructure = detectStructureBreaks(bars, swingLen, "swing");
  const internalStructure =
    swingLen > INTERNAL_SWING
      ? detectStructureBreaks(bars, INTERNAL_SWING, "internal")
      : [];

  const structureLines = [...swingStructure, ...internalStructure];
  const orderBlocks = detectOrderBlocks(bars, swingStructure);
  const fairValueGaps = detectFairValueGaps(bars);
  const atrValues = atr(bars);
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

/** BOS/CHoCH when price breaks prior swing level (ICT-style wick break). */
function detectStructureBreaks(
  bars: Bar[],
  swingLen: number,
  scope: "swing" | "internal"
): SmcStructureLine[] {
  const lines: SmcStructureLine[] = [];
  let trend: -1 | 0 | 1 = 0;
  let lastSwingHigh: SwingPoint | null = null;
  let lastSwingLow: SwingPoint | null = null;

  for (let i = 1; i < bars.length; i++) {
    const pivotIdx = i - swingLen;
    if (pivotIdx >= swingLen && pivotIdx < bars.length - swingLen) {
      if (isPivotHighAt(bars, pivotIdx, swingLen)) {
        lastSwingHigh = { index: pivotIdx, price: bars[pivotIdx].high };
      }
      if (isPivotLowAt(bars, pivotIdx, swingLen)) {
        lastSwingLow = { index: pivotIdx, price: bars[pivotIdx].low };
      }
    }

    const bar = bars[i];
    const prev = bars[i - 1];

    if (
      lastSwingHigh &&
      bar.high > lastSwingHigh.price &&
      prev.high <= lastSwingHigh.price
    ) {
      const type: "bos" | "choch" = trend === -1 ? "choch" : "bos";
      lines.push({
        fromIndex: lastSwingHigh.index,
        toIndex: i,
        price: lastSwingHigh.price,
        type,
        direction: "bullish",
        scope,
      });
      trend = 1;
      lastSwingHigh = { index: i, price: bar.high };
    }

    if (
      lastSwingLow &&
      bar.low < lastSwingLow.price &&
      prev.low >= lastSwingLow.price
    ) {
      const type: "bos" | "choch" = trend === 1 ? "choch" : "bos";
      lines.push({
        fromIndex: lastSwingLow.index,
        toIndex: i,
        price: lastSwingLow.price,
        type,
        direction: "bearish",
        scope,
      });
      trend = -1;
      lastSwingLow = { index: i, price: bar.low };
    }
  }

  const limit = scope === "swing" ? 10 : 14;
  return lines.slice(-limit);
}

function detectOrderBlocks(bars: Bar[], breaks: SmcStructureLine[]): OrderBlock[] {
  const blocks: OrderBlock[] = [];

  for (const brk of breaks) {
    const ob = findOrderBlockBeforeBreak(bars, brk.toIndex, brk.direction);
    if (!ob) continue;
    const extendIndex = findMitigationIndex(bars, ob, brk.toIndex);
    blocks.push({
      ...ob,
      endIndex: brk.toIndex,
      extendIndex,
    });
  }

  const unique = new Map<string, OrderBlock>();
  for (const b of blocks) {
    const key = `${b.type}-${b.startIndex}`;
    unique.set(key, b);
  }
  return [...unique.values()].slice(-6);
}

function findOrderBlockBeforeBreak(
  bars: Bar[],
  breakIndex: number,
  direction: "bullish" | "bearish"
): Omit<OrderBlock, "endIndex" | "extendIndex"> | null {
  for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 20); i--) {
    const bar = bars[i];
    if (direction === "bullish" && !isBullish(bar)) {
      return {
        startIndex: i,
        high: bar.high,
        low: bar.low,
        type: "bullish",
      };
    }
    if (direction === "bearish" && isBullish(bar)) {
      return {
        startIndex: i,
        high: bar.high,
        low: bar.low,
        type: "bearish",
      };
    }
  }
  return null;
}

function findMitigationIndex(
  bars: Bar[],
  ob: Pick<OrderBlock, "high" | "low" | "type" | "startIndex">,
  fromIndex: number
): number {
  for (let i = fromIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    if (ob.type === "bullish" && bar.low < ob.low) return i;
    if (ob.type === "bearish" && bar.high > ob.high) return i;
  }
  return bars.length - 1;
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
  const avgAtr =
    atrValues.filter((v) => v > 0).reduce((a, b) => a + b, 0) / (atrValues.length || 1);
  const tolerance = avgAtr * 0.1;

  for (let i = 1; i < swingHighs.length; i++) {
    const a = swingHighs[i - 1];
    const b = swingHighs[i];
    if (Math.abs(a.price - b.price) <= tolerance) {
      levels.push({
        index1: a.index,
        index2: b.index,
        price: (a.price + b.price) / 2,
        type: "eqh",
      });
    }
  }

  for (let i = 1; i < swingLows.length; i++) {
    const a = swingLows[i - 1];
    const b = swingLows[i];
    if (Math.abs(a.price - b.price) <= tolerance) {
      levels.push({
        index1: a.index,
        index2: b.index,
        price: (a.price + b.price) / 2,
        type: "eql",
      });
    }
  }

  return levels.slice(-6);
}

function detectPremiumDiscount(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[]
): PremiumDiscountZone | undefined {
  if (!swingHighs.length || !swingLows.length) return undefined;

  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];
  const top = lastHigh.price;
  const bottom = lastLow.price;
  if (top <= bottom) return undefined;

  return {
    top,
    bottom,
    equilibrium: (top + bottom) / 2,
    swingHighIndex: lastHigh.index,
    swingLowIndex: lastLow.index,
  };
}
