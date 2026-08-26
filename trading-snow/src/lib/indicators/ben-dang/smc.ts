import type { Bar, PremiumDiscountZone, SmcResult, SwingPoint } from "./types";
import { findPivotHighs, findPivotLows } from "./utils";

export function computeSmc(bars: Bar[], swingLength = 50): SmcResult {
  if (bars.length < 8) return { premiumDiscount: undefined };

  const swingLen = Math.max(5, Math.min(swingLength, Math.floor(bars.length / 3)));
  const swingHighs = findPivotHighs(bars, swingLen, swingLen);
  const swingLows = findPivotLows(bars, swingLen, swingLen);
  const currentPrice = bars[bars.length - 1].close;
  const premiumDiscount = detectPremiumDiscount(
    bars,
    swingHighs,
    swingLows,
    currentPrice,
    swingLen
  );

  return { premiumDiscount };
}

/**
 * ICT dealing range: last opposing swings, expanded with any newer unconfirmed
 * extreme so a dump/rally is inside the zone (price always in premium or discount).
 */
function detectPremiumDiscount(
  bars: Bar[],
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  currentPrice: number,
  swingLen: number
): PremiumDiscountZone | undefined {
  const lookback = Math.max(swingLen * 3, 24);
  let from = Math.max(0, bars.length - lookback);

  const lastHigh = swingHighs[swingHighs.length - 1];
  const lastLow = swingLows[swingLows.length - 1];
  if (lastHigh && lastLow) {
    from = Math.min(lastHigh.index, lastLow.index);
  } else if (lastHigh) {
    from = lastHigh.index;
  } else if (lastLow) {
    from = lastLow.index;
  }

  const slice = bars.slice(from);
  if (!slice.length) return undefined;

  let top = -Infinity;
  let bottom = Infinity;
  let topIdx = from;
  let botIdx = from;
  for (let i = 0; i < slice.length; i++) {
    const bar = slice[i];
    if (bar.high >= top) {
      top = bar.high;
      topIdx = from + i;
    }
    if (bar.low <= bottom) {
      bottom = bar.low;
      botIdx = from + i;
    }
  }

  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom) {
    return undefined;
  }

  // If confirmed swings still leave price outside (rare), expand to include it.
  if (currentPrice > top) top = currentPrice;
  if (currentPrice < bottom) bottom = currentPrice;
  if (top <= bottom) return undefined;

  return {
    top,
    bottom,
    equilibrium: (top + bottom) / 2,
    swingHighIndex: topIdx,
    swingLowIndex: botIdx,
  };
}
