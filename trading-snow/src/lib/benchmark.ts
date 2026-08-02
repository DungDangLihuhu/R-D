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

function lookupBenchmarkPrice(benchmark: HistoryPoint[], date: string): number {
  let price = 0;
  for (const point of benchmark) {
    if (point.date > date) break;
    price = point.close;
  }
  return price;
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

function resolvePeriodStart(
  dates: string[],
  equityByDate: Map<string, number>,
  requestedStart: string
): { periodStart: string; startEquity: number } | null {
  const candidates = dates.filter((d) => d >= requestedStart);
  const search = candidates.length > 0 ? candidates : dates;

  for (const d of search) {
    const equity = equityByDate.get(d) ?? 0;
    if (equity > 0) return { periodStart: d, startEquity: equity };
  }

  return null;
}

/** Match S&P 500 to external cash flows only (not BUY/SELL). */
function applyExternalSp500Flow(
  spyShares: number,
  tx: Transaction,
  spyPrice: number
): number {
  if (spyPrice <= 0) return spyShares;

  const gross = tx.quantity * tx.price;

  switch (tx.type) {
    case "DEPOSIT":
      return spyShares + gross / spyPrice;
    case "WITHDRAW": {
      const maxSell = spyShares * spyPrice;
      const amount = Math.min(gross, maxSell);
      return spyShares - amount / spyPrice;
    }
    case "DIVIDEND": {
      const amount = gross - tx.fee;
      return amount > 0 ? spyShares + amount / spyPrice : spyShares;
    }
    default:
      return spyShares;
  }
}

/**
 * Compare portfolio NAV vs S&P 500 with matched external flows:
 * - Portfolio = raw NAV (lợi nhuận ròng)
 * - S&P seeded at period start, then mirrors DEPOSIT/WITHDRAW/DIVIDEND
 * - BUY/SELL are internal reallocations — do not move benchmark
 * - Both normalized to 100 at period start
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

  const period = resolvePeriodStart(dates, equityByDate, startDate);
  if (!period) return null;

  const { periodStart, startEquity } = period;
  const startBenchIdx = benchInRange.findIndex((b) => b.date >= periodStart);
  if (startBenchIdx < 0) return null;

  const benchFromStart = benchInRange.slice(startBenchIdx);
  const startBench = benchFromStart[0].close;
  if (startBench <= 0) return null;

  let spyShares = startEquity / startBench;
  const sortedTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  let txIdx = 0;

  const points: ComparisonPoint[] = benchFromStart.map((b) => {
    while (txIdx < sortedTx.length) {
      const txDate = sortedTx[txIdx].date.slice(0, 10);
      if (txDate > b.date) break;

      if (txDate > periodStart) {
        const spyPrice = lookupBenchmarkPrice(benchmark, txDate);
        spyShares = applyExternalSp500Flow(spyShares, sortedTx[txIdx], spyPrice);
      }
      txIdx++;
    }

    const nav = equityByDate.get(b.date) ?? startEquity;
    const spyValue = spyShares * b.close;

    return {
      date: b.date,
      portfolio: (nav / startEquity) * 100,
      sp500: (spyValue / startEquity) * 100,
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
