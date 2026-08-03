import type { Bar, PremiumDiscountZone, SmcResult, SwingPoint } from "./types";
import { findPivotHighs, findPivotLows } from "./utils";

export function computeSmc(bars: Bar[], swingLength = 50): SmcResult {
  const empty: SmcResult = { premiumDiscount: undefined };
  if (bars.length < swingLength * 2 + 5) return empty;

  const swingLen = Math.max(5, Math.min(swingLength, Math.floor(bars.length / 3)));
  const swingHighs = findPivotHighs(bars, swingLen, swingLen);
  const swingLows = findPivotLows(bars, swingLen, swingLen);
  const currentPrice = bars[bars.length - 1].close;
  const premiumDiscount = detectPremiumDiscount(swingHighs, swingLows, currentPrice);

  return { premiumDiscount };
}

/** Dealing range from swings that bracket current price (ICT-style). */
function detectPremiumDiscount(
  swingHighs: SwingPoint[],
  swingLows: SwingPoint[],
  currentPrice: number
): PremiumDiscountZone | undefined {
  if (!swingHighs.length || !swingLows.length) return undefined;

  const highs = [...swingHighs].sort((a, b) => b.index - a.index);
  const lows = [...swingLows].sort((a, b) => b.index - a.index);

  let top: SwingPoint | undefined;
  let bottom: SwingPoint | undefined;

  for (const h of highs) {
    for (const l of lows) {
      if (h.price <= l.price) continue;
      if (currentPrice >= l.price && currentPrice <= h.price) {
        return zoneFrom(h, l);
      }
    }
  }

  top = highs[0];
  bottom = lows[0];
  if (!top || !bottom || top.price <= bottom.price) {
    top = swingHighs[swingHighs.length - 1];
    bottom = swingLows[swingLows.length - 1];
  }
  if (!top || !bottom || top.price <= bottom.price) return undefined;

  return zoneFrom(top, bottom);
}

function zoneFrom(top: SwingPoint, bottom: SwingPoint): PremiumDiscountZone {
  return {
    top: top.price,
    bottom: bottom.price,
    equilibrium: (top.price + bottom.price) / 2,
    swingHighIndex: top.index,
    swingLowIndex: bottom.index,
  };
}
