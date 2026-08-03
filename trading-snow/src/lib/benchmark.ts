import type { Transaction } from "./types";
import type { HistoryPoint } from "./yahoo";
import { downsampleMonthly } from "./format";

export type BenchmarkRange = "ytd" | "6m" | "1y" | "5y" | "all";

export interface ComparisonPoint {
  date: string;
  portfolio: number;
  sp500: number;
}

export interface ComparisonResult {
  points: ComparisonPoint[];
  /** Lợi nhuận ròng đang hold / cost CP đang hold × 100 */
  portfolioReturn: number;
  sp500Return: number;
  outperformance: number;
  holdingsCost: number;
  from: string;
  to: string;
  clampedToHistory: boolean;
}

export const BENCHMARK_RANGES: { value: BenchmarkRange; label: string }[] = [
  { value: "ytd", label: "YTD" },
  { value: "6m", label: "6 tháng" },
  { value: "1y", label: "1 năm" },
  { value: "5y", label: "5 năm" },
  { value: "all", label: "Tất cả" },
];

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ensureEquityCurve(
  equityCurve: { date: string; equity: number }[]
): { date: string; equity: number }[] {
  if (equityCurve.length === 0) return [];
  if (equityCurve.length >= 2) {
    return [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  }

  const only = equityCurve[0];
  return [
    { date: only.date, equity: only.equity },
    { date: new Date().toISOString(), equity: only.equity },
  ];
}

function portfolioInceptionDate(
  equityCurve: { date: string; equity: number }[],
  transactions: Transaction[] = []
): string {
  const sorted = ensureEquityCurve(equityCurve);
  const fromCurve = sorted[0]?.date.slice(0, 10) ?? "";

  if (transactions.length === 0) return fromCurve;

  const firstTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  )[0];
  const fromTx = firstTx?.date.slice(0, 10) ?? "";

  if (!fromCurve) return fromTx;
  if (!fromTx) return fromCurve;
  return fromTx < fromCurve ? fromTx : fromCurve;
}

export function resolveBenchmarkWindow(
  equityCurve: { date: string; equity: number }[],
  range: BenchmarkRange,
  now = new Date(),
  transactions: Transaction[] = []
): { from: string; to: string; clampedToHistory: boolean } | null {
  const curve = ensureEquityCurve(equityCurve);
  const portfolioStart =
    curve.length > 0
      ? portfolioInceptionDate(curve, transactions)
      : portfolioInceptionDate([], transactions);

  if (!portfolioStart) return null;

  const portfolioEnd =
    curve.length > 0
      ? curve[curve.length - 1].date.slice(0, 10)
      : toDateStr(now);
  const today = toDateStr(now);
  const to = today > portfolioEnd ? today : portfolioEnd;

  let requestedFrom: string;
  switch (range) {
    case "ytd":
      requestedFrom = `${now.getFullYear()}-01-01`;
      break;
    case "6m":
      requestedFrom = toDateStr(addMonths(now, 6));
      break;
    case "1y":
      requestedFrom = toDateStr(addMonths(now, 12));
      break;
    case "5y":
      requestedFrom = toDateStr(addMonths(now, 60));
      break;
    case "all":
    default:
      requestedFrom = portfolioStart;
      break;
  }

  const clampedToHistory = requestedFrom < portfolioStart;
  let from = clampedToHistory ? portfolioStart : requestedFrom;
  if (from > to) from = portfolioStart;

  return { from, to, clampedToHistory };
}

function pickBenchmarkSeries(
  benchmark: HistoryPoint[],
  startDate: string,
  endDate: string
): HistoryPoint[] {
  const series = benchmark
    .filter((b) => b.date >= startDate && b.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (series.length >= 2) return series;

  const upToEnd = benchmark
    .filter((b) => b.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (upToEnd.length >= 2) {
    const idx = upToEnd.findIndex((b) => b.date >= startDate);
    if (idx >= 0) return upToEnd.slice(idx);
    return upToEnd.slice(-2);
  }

  return benchmark.length >= 2 ? benchmark.slice(-2) : benchmark;
}

export interface PortfolioBenchmarkInput {
  unrealizedPnl: number;
  holdingsCost: number;
}

function computePortfolioReturn(input: PortfolioBenchmarkInput): {
  portfolioReturn: number;
  holdingsCost: number;
} | null {
  if (input.holdingsCost <= 0) return null;

  return {
    portfolioReturn: (input.unrealizedPnl / input.holdingsCost) * 100,
    holdingsCost: input.holdingsCost,
  };
}

/**
 * S&P 500: % tăng chỉ số theo timeframe.
 * Danh mục: lợi nhuận ròng đang hold / cost CP đang hold × 100.
 */
export function buildBenchmarkComparison(
  portfolio: PortfolioBenchmarkInput,
  benchmark: HistoryPoint[],
  window: { from: string; to: string; clampedToHistory?: boolean }
): ComparisonResult | null {
  if (benchmark.length < 1) return null;

  const metrics = computePortfolioReturn(portfolio);
  if (!metrics) return null;

  const benchInRange = pickBenchmarkSeries(
    benchmark,
    window.from,
    window.to
  );
  if (benchInRange.length < 2) return null;

  const baseClose = benchInRange[0].close;
  if (baseClose <= 0) return null;

  const portfolioIndex = 100 + metrics.portfolioReturn;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b) => ({
    date: b.date,
    sp500: (b.close / baseClose) * 100,
    portfolio: portfolioIndex,
  }));

  const points = downsampleMonthly(rawPoints);
  const last = rawPoints[rawPoints.length - 1];
  const sp500Return = last.sp500 - 100;

  return {
    points,
    portfolioReturn: metrics.portfolioReturn,
    sp500Return,
    outperformance: metrics.portfolioReturn - sp500Return,
    holdingsCost: metrics.holdingsCost,
    from: benchInRange[0].date,
    to: window.to,
    clampedToHistory: window.clampedToHistory ?? false,
  };
}

export function extendBenchmarkFrom(from: string, days = 14): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}
