import type { OhlcPoint } from "./chart-history";

export interface ChartDomainOptions {
  extras?: number[];
  padRatio?: number;
  extraMarginRatio?: number;
  tickCount?: number;
}

function validPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Y-axis domain from visible OHLC bars, with optional nearby overlay levels. */
export function computeChartYDomain(
  points: OhlcPoint[],
  options: ChartDomainOptions = {}
): [number, number] {
  const {
    extras = [],
    padRatio = 0.08,
    extraMarginRatio = 0.12,
    tickCount = 6,
  } = options;

  if (!points.length) return [0, 100];

  const highs = points.map((p) => p.high).filter(validPrice);
  const lows = points.map((p) => p.low).filter(validPrice);
  if (!highs.length || !lows.length) return [0, 100];

  let min = Math.min(...lows);
  let max = Math.max(...highs);
  let span = max - min || max * 0.02;

  const nearRange = (price: number) =>
    validPrice(price) &&
    price >= min - span * extraMarginRatio &&
    price <= max + span * extraMarginRatio;

  const includedExtras = extras.filter(nearRange);
  if (includedExtras.length) {
    min = Math.min(min, ...includedExtras);
    max = Math.max(max, ...includedExtras);
    span = max - min || max * 0.02;
  }

  const pad = span * padRatio;
  const raw: [number, number] = [Math.max(min - pad, 0), max + pad];
  return niceYDomain(raw, tickCount);
}

/** Snap domain bounds to even tick steps. */
export function niceYDomain(
  domain: [number, number],
  tickCount = 6
): [number, number] {
  const [min, max] = domain;
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return domain;

  const roughStep = span / Math.max(tickCount - 1, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;
  const niceStep =
    normalized <= 1
      ? magnitude
      : normalized <= 2
        ? 2 * magnitude
        : normalized <= 5
          ? 5 * magnitude
          : 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  if (niceMax <= niceMin) return [min, max];
  return [niceMin, niceMax];
}

export function formatChartPrice(value: number): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 10_000) return value.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(4);
}
