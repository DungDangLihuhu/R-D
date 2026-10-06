export const ANALYST_TARGET_WINDOW_DAYS = 90;
export const ANALYST_TARGET_WINDOW_SEC = ANALYST_TARGET_WINDOW_DAYS * 24 * 3600;

/** Danh sách target trên trang Phân tích: tối đa 6 tháng, mới nhất trước. */
export const PRICE_TARGET_LIST_WINDOW_DAYS = 183;
export const PRICE_TARGET_LIST_WINDOW_SEC = PRICE_TARGET_LIST_WINDOW_DAYS * 24 * 3600;

/** Modest premium to the sector multiple — “đắt so với ngành”. */
export const INDUSTRY_SELL_PREMIUM = 1.12;

export interface AnalystGradeRow {
  epochGradeDate: number;
  firm: string;
  currentPriceTarget?: number;
  priorPriceTarget?: number;
  /** Yahoo: up / down / init / main / reit, hoặc Raises / Lowers… */
  action?: string;
  priceTargetAction?: string;
  toGrade?: string;
  fromGrade?: string;
}

export type PriceTargetChange = "up" | "down" | "init" | "flat";

export interface ListedPriceTarget {
  epoch: number;
  date: string;
  firm: string;
  price: number;
  priorPrice?: number;
  grade?: string;
  change: PriceTargetChange;
  changeLabel: string;
  upsidePercent: number;
}

export interface AnalystTargetSummary {
  price: number;
  median?: number;
  firmCount: number;
  source: "3m" | "consensus";
  label: string;
  yahooMean?: number;
}

export interface IndustryMultiples {
  medianForwardPe?: number;
  medianTrailingPe?: number;
  peerCount: number;
}

export interface IndustrySellAnchor {
  price: number;
  fair: number;
  multiple: number;
  label: string;
}

function finitePositive(value: number | null | undefined): number | undefined {
  if (value != null && Number.isFinite(value) && value > 0) return value;
  return undefined;
}

export function median(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

export function mean(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function weightedMean(parts: { price: number; weight: number }[]): number | null {
  const xs = parts.filter((p) => Number.isFinite(p.price) && p.price > 0 && p.weight > 0);
  if (!xs.length) return null;
  const w = xs.reduce((s, p) => s + p.weight, 0);
  if (!(w > 0)) return null;
  return xs.reduce((s, p) => s + p.price * p.weight, 0) / w;
}

function toEpochSeconds(epoch: number): number {
  return epoch > 1e12 ? epoch / 1000 : epoch;
}

function inPriceBand(value: number, spot: number): boolean {
  return value > spot * 0.35 && value <= spot * 2.8;
}

/**
 * Latest price target per broker from the last 90 days, then the average.
 * Falls back to Yahoo's live consensus mean when fewer than 2 dated targets exist.
 */
export function summarizeAnalystTargets(
  spot: number,
  history: AnalystGradeRow[],
  consensusMean?: number,
  nowSec = Date.now() / 1000
): AnalystTargetSummary | null {
  const cutoff = nowSec - ANALYST_TARGET_WINDOW_SEC;
  const latest = new Map<string, { epoch: number; target: number }>();

  for (const row of history) {
    const epoch = toEpochSeconds(row.epochGradeDate);
    const firm = row.firm?.trim();
    const target = row.currentPriceTarget;
    if (!firm || !(epoch >= cutoff) || target == null || !inPriceBand(target, spot)) continue;
    const prev = latest.get(firm.toUpperCase());
    if (!prev || epoch > prev.epoch) {
      latest.set(firm.toUpperCase(), { epoch, target });
    }
  }

  const pts = [...latest.values()].map((r) => r.target);
  const avg3m = mean(pts);
  const med3m = median(pts);

  if (avg3m != null && pts.length >= 2) {
    return {
      price: avg3m,
      median: med3m ?? undefined,
      firmCount: pts.length,
      source: "3m",
      label: `PT CTCK 3 tháng (${pts.length} hãng)`,
      yahooMean: finitePositive(consensusMean),
    };
  }

  const consensus = finitePositive(consensusMean);
  if (consensus != null && inPriceBand(consensus, spot)) {
    return {
      price: consensus,
      firmCount: pts.length,
      source: "consensus",
      label: "PT CTCK (consensus)",
      yahooMean: consensus,
    };
  }

  return null;
}

function changeFromAction(action: string | undefined): PriceTargetChange | null {
  const key = (action ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key === "up" || key === "raises" || key === "raise") return "up";
  if (key === "down" || key === "lowers" || key === "lower") return "down";
  if (key === "init" || key === "initiates" || key === "initiate") return "init";
  if (key === "main" || key === "reit" || key === "maintains" || key === "reiterates") return "flat";
  return null;
}

const CHANGE_LABEL: Record<PriceTargetChange, string> = {
  up: "Nâng",
  down: "Hạ",
  init: "Khởi tạo",
  flat: "Giữ",
};

/**
 * Mọi target có giá trong 6 tháng, mới nhất trước.
 * Trung bình mốc bán vẫn chỉ dùng 90 ngày (`summarizeAnalystTargets`).
 */
export function listRecentPriceTargets(
  history: AnalystGradeRow[],
  spot: number,
  nowSec = Date.now() / 1000
): ListedPriceTarget[] {
  const cutoff = nowSec - PRICE_TARGET_LIST_WINDOW_SEC;
  const rows: ListedPriceTarget[] = [];

  for (const row of history) {
    const epoch = toEpochSeconds(row.epochGradeDate);
    const firm = row.firm?.trim();
    const price = row.currentPriceTarget;
    if (!firm || !(epoch >= cutoff) || price == null || !Number.isFinite(price) || !(price > 0)) {
      continue;
    }
    const prior =
      row.priorPriceTarget != null &&
      Number.isFinite(row.priorPriceTarget) &&
      row.priorPriceTarget > 0
        ? row.priorPriceTarget
        : undefined;
    const fromAction =
      changeFromAction(row.priceTargetAction) ?? changeFromAction(row.action);
    let change: PriceTargetChange = fromAction ?? "flat";
    if (!fromAction && prior != null) {
      if (price > prior) change = "up";
      else if (price < prior) change = "down";
    }
    rows.push({
      epoch,
      date: new Date(epoch * 1000).toISOString(),
      firm,
      price,
      priorPrice: prior,
      grade: row.toGrade?.trim() || undefined,
      change,
      changeLabel: CHANGE_LABEL[change],
      upsidePercent: spot > 0 ? ((price - spot) / spot) * 100 : 0,
    });
  }

  rows.sort((a, b) => b.epoch - a.epoch || a.firm.localeCompare(b.firm));
  return rows;
}

export function summarizeIndustryMultiples(
  peers: { forwardPe?: number; trailingPe?: number }[]
): IndustryMultiples | null {
  const fwd = peers
    .map((p) => p.forwardPe)
    .filter((v): v is number => v != null && v > 5 && v < 80);
  const trail = peers
    .map((p) => p.trailingPe)
    .filter((v): v is number => v != null && v > 5 && v < 80);
  if (fwd.length < 2 && trail.length < 2) return null;
  return {
    medianForwardPe: median(fwd) ?? undefined,
    medianTrailingPe: median(trail) ?? undefined,
    peerCount: Math.max(fwd.length, trail.length),
  };
}

/**
 * Sell zone vs ngành: EPS × median peer P/E × 1.12.
 * Skip when EPS is missing/negative or the implied price is not a real upside target.
 */
export function industryValuationSell(
  spot: number,
  metrics: Record<string, number> | undefined,
  industry: IndustryMultiples | null | undefined
): IndustrySellAnchor | null {
  if (!metrics || !industry) return null;
  const eps = finitePositive(metrics.epsTTM);
  const multiple = finitePositive(industry.medianForwardPe) ?? finitePositive(industry.medianTrailingPe);
  if (eps == null || multiple == null) return null;
  if (multiple < 6 || multiple > 55) return null;

  const fair = eps * multiple;
  const sell = fair * INDUSTRY_SELL_PREMIUM;
  if (!inPriceBand(sell, spot) && !inPriceBand(fair, spot)) return null;
  if (!(sell > 0)) return null;

  const kind = industry.medianForwardPe != null ? "P/E fwd ngành" : "P/E ngành";
  return {
    price: sell,
    fair,
    multiple,
    label: `${kind} ${multiple.toFixed(0)}× +${Math.round((INDUSTRY_SELL_PREMIUM - 1) * 100)}%`,
  };
}
