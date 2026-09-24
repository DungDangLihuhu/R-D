import type {
  WyckoffEntryAction,
  WyckoffResult,
  WyckoffTimeframe,
} from "./indicators/ben-dang/types";

/** Market price may sit this far from the Wyckoff buy level and still count. */
export const BUY_PRICE_BAND = 0.05;

/** Số phiên của đường trung bình xu hướng dài hạn. */
export const TREND_SMA_PERIOD = 200;

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

export interface HoldingSignal {
  symbol: string;
  marketPrice: number;
  hits: WyckoffBuyHit[];
  trend: DailyTrend;
}

export type TrendState = "up" | "down" | "unknown";

export interface DailyTrend {
  state: TrendState;
  /** SMA200 của giá đóng cửa ngày; null khi chưa đủ 200 phiên. */
  sma: number | null;
}

/**
 * Giá so với SMA200 ngày. Backtest 1D (58 mã lớn, 2017–2026, giữ tối đa 60 phiên): tín
 * hiệu Wyckoff khi giá trên SMA200 hơn SPY +1,3%/lệnh, dưới SMA200 kém SPY −0,7%/lệnh.
 */
export function dailyTrend(
  closes: number[],
  price: number,
  period = TREND_SMA_PERIOD
): DailyTrend {
  const valid = closes.filter((c) => Number.isFinite(c) && c > 0);
  if (valid.length < period || !(price > 0) || !Number.isFinite(price)) {
    return { state: "unknown", sma: null };
  }
  let sum = 0;
  for (let i = valid.length - period; i < valid.length; i++) sum += valid[i];
  const sma = sum / period;
  return { state: price >= sma ? "up" : "down", sma };
}

/** Mốc đủ điều kiện mua: Wyckoff báo "có thể vào" và giá không nằm dưới SMA200 ngày. */
export function isActionableHit(hit: WyckoffBuyHit, trend: TrendState): boolean {
  return hit.entryAction === "buy" && trend !== "down";
}

/** Mốc tốt nhất để hiện trên thẻ: ưu tiên mốc đủ điều kiện mua, rồi mốc sát giá nhất. */
export function primaryHit(signal: HoldingSignal): { hit: WyckoffBuyHit; actionable: boolean } {
  const actionable = signal.hits.find((h) => isActionableHit(h, signal.trend.state));
  return actionable ? { hit: actionable, actionable: true } : { hit: signal.hits[0], actionable: false };
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
