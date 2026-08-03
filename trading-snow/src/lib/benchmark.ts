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
  portfolioReturn: number;
  sp500Return: number;
  outperformance: number;
  investedCapital: number;
  from: string;
  to: string;
  /** True when selected range starts before first trade (e.g. 5Y but only 2Y history). */
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

/** Resolve comparison window; always clamps `from` to first trade date. */
export function resolveBenchmarkWindow(
  equityCurve: { date: string; equity: number }[],
  range: BenchmarkRange,
  now = new Date(),
  transactions: Transaction[] = []
): { from: string; to: string; clampedToHistory: boolean } | null {
  const curve = ensureEquityCurve(equityCurve);
  if (curve.length < 2) return null;

  const portfolioStart = portfolioInceptionDate(curve, transactions);
  const portfolioEnd = curve[curve.length - 1].date.slice(0, 10);
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

function isSnowballAutoDeposit(tx: Transaction): boolean {
  return (
    tx.type === "DEPOSIT" &&
    tx.symbol === "CASH" &&
    (tx.notes?.includes("Snowball Holdings") ?? false)
  );
}

function hasTradeTransactions(transactions: Transaction[]): boolean {
  return transactions.some((t) => t.type === "BUY" || t.type === "SELL");
}

/** External cash flows for TWR (GIPS / Portfolio Performance style). */
function buildCashFlowsByDate(
  transactions: Transaction[],
  hasTrades: boolean,
  skipSnowballDeposit: boolean
): Map<string, number> {
  const flows = new Map<string, number>();

  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (skipSnowballDeposit && isSnowballAutoDeposit(tx)) continue;

    const date = tx.date.slice(0, 10);
    const gross = tx.quantity * tx.price;
    let flow = 0;

    if (hasTrades) {
      switch (tx.type) {
        case "BUY":
          flow = gross + tx.fee;
          break;
        case "SELL":
          flow = -(gross - tx.fee);
          break;
      }
    } else {
      switch (tx.type) {
        case "DEPOSIT":
          flow = gross;
          break;
        case "WITHDRAW":
          flow = -gross;
          break;
      }
    }

    if (flow !== 0) {
      flows.set(date, (flows.get(date) ?? 0) + flow);
    }
  }

  return flows;
}

function equityPointsInRange(
  equityCurve: { date: string; equity: number }[],
  from: string,
  to: string
): { date: string; equity: number }[] {
  return equityCurve
    .map((p) => ({ date: p.date.slice(0, 10), equity: p.equity }))
    .filter((p) => p.date >= from && p.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function navAtDate(
  equityCurve: { date: string; equity: number }[],
  targetDate: string
): number {
  let nav = 0;
  for (const point of equityCurve) {
    const date = point.date.slice(0, 10);
    if (date > targetDate) break;
    nav = point.equity;
  }
  return nav;
}

/**
 * Time-weighted cumulative index (base 100) reset at window start.
 * Sub-period return: (End - Flow) / Begin - 1, chain-linked geometrically.
 */
function portfolioTwrIndexAt(
  equityCurve: { date: string; equity: number }[],
  cashFlows: Map<string, number>,
  targetDate: string,
  windowStart: string
): number {
  const startNav = navAtDate(equityCurve, windowStart);
  if (startNav <= 0) return 100;

  const events = equityCurve
    .map((p) => ({ date: p.date.slice(0, 10), equity: p.equity }))
    .filter((p) => p.date > windowStart && p.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  let index = 100;
  let prevNav = startNav;

  for (const event of events) {
    const flow = cashFlows.get(event.date) ?? 0;
    if (prevNav <= 0) continue;
    const subReturn = (event.equity - flow) / prevNav - 1;
    index *= 1 + subReturn;
    prevNav = event.equity;
  }

  return index;
}

function resolveComparisonStart(
  equityPoints: { date: string; equity: number }[],
  benchDays: HistoryPoint[],
  windowFrom: string
): string {
  const firstEquity = equityPoints[0]?.date ?? windowFrom;
  const firstBench =
    benchDays.find((b) => b.date >= windowFrom)?.date ?? benchDays[0]?.date ?? windowFrom;
  return firstEquity > firstBench ? firstEquity : firstBench;
}

function netCapitalAtDate(
  cashFlows: Map<string, number>,
  targetDate: string
): number {
  let total = 0;
  for (const [date, flow] of cashFlows) {
    if (date <= targetDate) total += flow;
  }
  return total;
}

/**
 * Benchmark vs S&P 500 (industry-standard indexed comparison):
 * - Portfolio: time-weighted return (TWR) from equity curve, stripping external cash flows
 * - S&P 500: pure index price return normalized to 100 at period start (no cash-flow mirror)
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  _currentTradingValue: number,
  window?: { from: string; to: string; clampedToHistory?: boolean }
): ComparisonResult | null {
  const curve = ensureEquityCurve(equityCurve);
  if (curve.length < 2 || benchmark.length < 1) return null;

  const sortedBenchmark = [...benchmark].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const portfolioStart = portfolioInceptionDate(curve, transactions);
  const requestedStart = window?.from ?? portfolioStart;
  const startDate =
    requestedStart < portfolioStart ? portfolioStart : requestedStart;
  const endDate =
    window?.to ?? curve[curve.length - 1].date.slice(0, 10);
  const clampedToHistory =
    window?.clampedToHistory ?? requestedStart < portfolioStart;

  const benchInRange = pickBenchmarkSeries(sortedBenchmark, startDate, endDate);
  if (benchInRange.length < 2) return null;

  const sortedTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const hasTrades = hasTradeTransactions(sortedTx);
  const skipSnowballDeposit = hasTrades;
  const cashFlows = buildCashFlowsByDate(
    sortedTx,
    hasTrades,
    skipSnowballDeposit
  );

  const equityInRange = equityPointsInRange(curve, startDate, endDate);
  if (equityInRange.length < 1 && navAtDate(curve, startDate) <= 0) return null;

  const comparisonStart = resolveComparisonStart(
    equityInRange.length > 0 ? equityInRange : curve,
    benchInRange,
    startDate
  );

  const benchFromStart = benchInRange.filter((b) => b.date >= comparisonStart);
  if (benchFromStart.length < 2) return null;

  const spyBaseClose = benchFromStart[0].close;
  if (spyBaseClose <= 0) return null;

  const dailyPoints: ComparisonPoint[] = benchFromStart.map((b) => ({
    date: b.date,
    portfolio: portfolioTwrIndexAt(
      curve,
      cashFlows,
      b.date,
      comparisonStart
    ),
    sp500: (b.close / spyBaseClose) * 100,
  }));

  const last = dailyPoints[dailyPoints.length - 1];
  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  const points = downsampleMonthly(dailyPoints);

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: netCapitalAtDate(cashFlows, endDate),
    from: comparisonStart,
    to: endDate,
    clampedToHistory,
  };
}

/** Fetch benchmark from a few days earlier to ensure enough data points. */
export function extendBenchmarkFrom(from: string, days = 14): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}
