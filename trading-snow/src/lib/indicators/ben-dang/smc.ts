import type { Bar, PremiumDiscountZone, SmcResult, SwingPoint } from "./types";
import { findPivotHighs, findPivotLows } from "./utils";

export function computeSmc(bars: Bar[], swingLength = 50): SmcResult {
  const empty: SmcResult = { premiumDiscount: undefined };
  if (bars.length < swingLength * 2 + 5) return empty;

  const swingLen = Math.max(5, Math.min(swingLength, Math.floor(bars.length / 3)));
  const swingHighs = findPivotHighs(bars, swingLen, swingLen);
  const swingLows = findPivotLows(bars, swingLen, swingLen);
  const premiumDiscount = detectPremiumDiscount(swingHighs, swingLows);

  return { premiumDiscount };
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
