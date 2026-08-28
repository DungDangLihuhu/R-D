export const ANALYST_TARGET_WINDOW_DAYS = 90;
export const ANALYST_TARGET_WINDOW_SEC = ANALYST_TARGET_WINDOW_DAYS * 24 * 3600;

/** Modest premium to the sector multiple — “đắt so với ngành”. */
export const INDUSTRY_SELL_PREMIUM = 1.12;

export interface AnalystGradeRow {
  epochGradeDate: number;
  firm: string;
  currentPriceTarget?: number;
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
