import type {
  WyckoffEntryAction,
  WyckoffResult,
  WyckoffTimeframe,
} from "./indicators/ben-dang/types";

/** Market price may sit this far from the Wyckoff buy level and still count. */
export const BUY_PRICE_BAND = 0.05;

export const SIGNAL_TIMEFRAMES = ["1h", "4h", "1d", "1w"] as const satisfies readonly WyckoffTimeframe[];
export type SignalTimeframe = (typeof SIGNAL_TIMEFRAMES)[number];

export const SIGNAL_TIMEFRAME_LABELS: Record<SignalTimeframe, string> = {
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
};

export function buyPriceDistancePct(marketPrice: number, buyPrice: number): number | null {
  if (!(marketPrice > 0) || !(buyPrice > 0) || !Number.isFinite(marketPrice) || !Number.isFinite(buyPrice)) {
    return null;
  }
  return ((marketPrice - buyPrice) / buyPrice) * 100;
}

export function isWithinBuyPriceBand(
  marketPrice: number,
  buyPrice: number,
  band = BUY_PRICE_BAND
): boolean {
  const pct = buyPriceDistancePct(marketPrice, buyPrice);
  return pct != null && Math.abs(pct) <= band * 100;
}

/** Long setup only: stop must be below entry, and price must not already be through the stop. */
export function isValidLongLevels(
  entryPrice: number,
  stop: number | null | undefined,
  marketPrice: number
): boolean {
  if (!(entryPrice > 0) || !Number.isFinite(entryPrice)) return false;
  if (stop == null || !(stop > 0) || !Number.isFinite(stop)) return true;
  if (stop >= entryPrice) return false;
  if (marketPrice > 0 && Number.isFinite(marketPrice) && marketPrice <= stop) return false;
  return true;
}

export interface WyckoffBuyHit {
  timeframe: SignalTimeframe;
  phase: WyckoffResult["phase"];
  phaseLabel: string;
  confidence: number;
  confidenceLabel: string;
  entryPrice: number;
  entryLabel: string;
  entryAction: Exclude<WyckoffEntryAction, "avoid">;
  reason: string;
  stop: number | null;
  ice?: number;
  creek?: number;
  distPct: number;
}

export function wyckoffBuyHit(
  result: WyckoffResult,
  marketPrice: number,
  timeframe: SignalTimeframe
): WyckoffBuyHit | null {
  const entry = result.entry;
  if (!entry || entry.action === "avoid" || entry.price <= 0) return null;
  if (!isWithinBuyPriceBand(marketPrice, entry.price)) return null;
  if (!isValidLongLevels(entry.price, entry.stop, marketPrice)) return null;
  const distPct = buyPriceDistancePct(marketPrice, entry.price);
  if (distPct == null) return null;

  return {
    timeframe,
    phase: result.phase,
    phaseLabel: result.phaseLabel,
    confidence: result.confidence.score,
    confidenceLabel: result.confidence.label,
    entryPrice: entry.price,
    entryLabel: entry.label,
    entryAction: entry.action,
    reason: entry.reason,
    stop: entry.stop,
    ice: result.tradingRange?.ice,
    creek: result.tradingRange?.creek,
    distPct,
  };
}
