import type { Transaction } from "./types";
import type { HistoryPoint } from "./yahoo";

export type BenchmarkRange = "ytd" | "6m" | "1y" | "5y" | "all";

export interface ComparisonPoint {
  date: string;
  portfolio: number;
  sp500: number;
}

export interface ComparisonResult {
  points: ComparisonPoint[];
  portfolioReturn: number;
  sp500Return: number;
  outperformance: number;
  investedCapital: number;
  from: string;
  to: string;
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

/** Pad curve so benchmark always has at least 2 points. */
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

/** Resolve comparison window; clamps to portfolio history. */
export function resolveBenchmarkWindow(
  equityCurve: { date: string; equity: number }[],
  range: BenchmarkRange,
  now = new Date()
): { from: string; to: string } | null {
  const curve = ensureEquityCurve(equityCurve);
  if (curve.length < 2) return null;

  const portfolioStart = curve[0].date.slice(0, 10);
  const portfolioEnd = curve[curve.length - 1].date.slice(0, 10);
  const today = toDateStr(now);
  const to = today > portfolioEnd ? today : portfolioEnd;

  let from: string;
  switch (range) {
    case "ytd":
      from = `${now.getFullYear()}-01-01`;
      break;
    case "6m":
      from = toDateStr(addMonths(now, 6));
      break;
    case "1y":
      from = toDateStr(addMonths(now, 12));
      break;
    case "5y":
      from = toDateStr(addMonths(now, 60));
      break;
    case "all":
    default:
      from = portfolioStart;
      break;
  }

  if (from < portfolioStart) from = portfolioStart;
  if (from > to) from = portfolioStart;

  return { from, to };
}

function forwardFillEquity(
  equityCurve: { date: string; equity: number }[],
  dates: string[]
): Map<string, number> {
  const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, number>();
  let idx = 0;
  let current = sorted[0]?.equity ?? 0;

  for (const date of dates) {
    while (
      idx + 1 < sorted.length &&
      sorted[idx + 1].date.slice(0, 10) <= date
    ) {
      idx++;
      current = sorted[idx].equity;
    }
    map.set(date, current);
  }
  return map;
}

/** Net nạp − rút sau ngày bắt đầu mốc (BUY/SELL không tính). */
function netExternalFlowSince(
  transactions: Transaction[],
  periodStart: string,
  untilDate: string
): number {
  let net = 0;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    const d = tx.date.slice(0, 10);
    if (d <= periodStart) continue;
    if (d > untilDate) break;

    const gross = tx.quantity * tx.price;
    if (tx.type === "DEPOSIT") net += gross;
    else if (tx.type === "WITHDRAW") net -= gross;
  }

  return net;
}

function adjustedEquity(
  rawEquity: number,
  transactions: Transaction[],
  periodStart: string,
  asOfDate: string
): number {
  return rawEquity - netExternalFlowSince(transactions, periodStart, asOfDate);
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
    const sliceFrom = idx >= 0 ? Math.max(0, idx - 1) : upToEnd.length - 2;
    return upToEnd.slice(sliceFrom);
  }

  return benchmark.length >= 2
    ? benchmark.slice(-2)
    : benchmark;
}

function resolvePeriodStart(
  dates: string[],
  equityByDate: Map<string, number>,
  transactions: Transaction[],
  requestedStart: string
): { periodStart: string; startEquity: number } {
  const tryStart = (start: string) => {
    const raw = equityByDate.get(start) ?? equityByDate.get(dates[0]) ?? 0;
    const adj = adjustedEquity(raw, transactions, start, start);
    return { periodStart: start, startEquity: adj, raw };
  };

  const { periodStart, startEquity, raw } = tryStart(requestedStart);

  if (startEquity > 0) return { periodStart, startEquity };

  for (const d of dates) {
    const candidate = tryStart(d);
    if (candidate.startEquity > 0) {
      return { periodStart: candidate.periodStart, startEquity: candidate.startEquity };
    }
  }

  const fallback = Math.max(Math.abs(raw), Math.abs(startEquity), 1);
  return { periodStart, startEquity: fallback };
}

/**
 * Compare portfolio vs S&P 500 from period start:
 * - Vốn mốc = giá trị danh mục tại ngày đầu kỳ (điều chỉnh nạp/rút)
 * - S&P: mua giữ từ đầu kỳ với cùng vốn mốc
 * - Cả hai chuẩn hóa = 100 tại ngày đầu kỳ
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  window?: { from: string; to: string }
): ComparisonResult | null {
  const curve = ensureEquityCurve(equityCurve);
  if (curve.length < 2 || benchmark.length < 1) return null;

  const sortedEquity = [...curve].sort((a, b) => a.date.localeCompare(b.date));
  const startDate = window?.from ?? sortedEquity[0].date.slice(0, 10);
  const endDate =
    window?.to ?? sortedEquity[sortedEquity.length - 1].date.slice(0, 10);

  const benchInRange = pickBenchmarkSeries(benchmark, startDate, endDate);
  if (benchInRange.length < 1) return null;

  const dates = benchInRange.map((b) => b.date);
  const equityByDate = forwardFillEquity(sortedEquity, dates);

  const { periodStart, startEquity } = resolvePeriodStart(
    dates,
    equityByDate,
    transactions,
    dates[0]
  );

  const startBenchIdx = benchInRange.findIndex((b) => b.date >= periodStart);
  const startBench =
    benchInRange[startBenchIdx >= 0 ? startBenchIdx : 0].close;
  if (startBench <= 0) return null;

  const benchFromStart =
    startBenchIdx > 0 ? benchInRange.slice(startBenchIdx) : benchInRange;

  const points: ComparisonPoint[] = benchFromStart.map((b) => {
    const raw = equityByDate.get(b.date) ?? startEquity;
    const adj = adjustedEquity(raw, transactions, periodStart, b.date);

    return {
      date: b.date,
      portfolio: (adj / startEquity) * 100,
      sp500: (b.close / startBench) * 100,
    };
  });

  if (points.length < 1) return null;

  const last = points[points.length - 1];
  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: startEquity,
    from: periodStart,
    to: endDate,
  };
}

/** Fetch benchmark from a few days earlier to ensure enough data points. */
export function extendBenchmarkFrom(from: string, days = 14): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}
