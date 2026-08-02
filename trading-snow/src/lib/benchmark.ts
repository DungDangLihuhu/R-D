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

/**
 * Forward-fill NAV on benchmark dates.
 * Dates before the first trade stay at 0 — avoids showing portfolio value pre-inception.
 */
function forwardFillEquity(
  equityCurve: { date: string; equity: number }[],
  dates: string[]
): Map<string, number> {
  const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map<string, number>();
  if (sorted.length === 0) return map;

  let idx = -1;
  let current = 0;

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

  for (const d of candidates) {
    const equity = equityByDate.get(d) ?? 0;
    if (equity > 0) return { periodStart: d, startEquity: equity };
  }

  return null;
}

function indexFromStart(value: number, startValue: number): number {
  if (startValue <= 0) return 100;
  return (value / startValue) * 100;
}

interface PositionState {
  quantity: number;
  totalCost: number;
}

interface PortfolioSnapshot {
  holdingsCost: number;
  tradingValue: number;
}

function isSnowballAutoDeposit(tx: Transaction): boolean {
  return (
    tx.type === "DEPOSIT" &&
    tx.symbol === "CASH" &&
    (tx.notes?.includes("Snowball Holdings") ?? false)
  );
}

/** Replay portfolio to a date — matches stats trading equity + holdings cost. */
function snapshotPortfolioAt(
  transactions: Transaction[],
  throughDate: string,
  skipSnowballDeposit: boolean
): PortfolioSnapshot {
  const positions = new Map<string, PositionState>();
  const lastPrices = new Map<string, number>();
  let realizedPnl = 0;

  const holdingsCost = () => {
    let cost = 0;
    for (const pos of positions.values()) cost += pos.totalCost;
    return cost;
  };

  const holdingsValue = () => {
    let value = 0;
    for (const [symbol, pos] of positions) {
      if (pos.quantity <= 0) continue;
      const price =
        lastPrices.get(symbol) ?? pos.totalCost / pos.quantity;
      value += pos.quantity * price;
    }
    return value;
  };

  for (const tx of transactions) {
    const txDate = tx.date.slice(0, 10);
    if (txDate > throughDate) break;
    if (skipSnowballDeposit && isSnowballAutoDeposit(tx)) continue;

    const gross = tx.quantity * tx.price;

    switch (tx.type) {
      case "BUY": {
        const cost = gross + tx.fee;
        const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
        pos.quantity += tx.quantity;
        pos.totalCost += cost;
        positions.set(tx.symbol, pos);
        lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "SELL": {
        const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        const costBasis = avgCost * tx.quantity;
        const proceeds = gross - tx.fee;
        realizedPnl += proceeds - costBasis;
        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - costBasis);
        positions.set(tx.symbol, pos);
        lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "DIVIDEND":
        realizedPnl += gross - tx.fee;
        break;
      case "DEPOSIT":
      case "WITHDRAW":
        break;
    }
  }

  return {
    holdingsCost: holdingsCost(),
    tradingValue: holdingsValue() + realizedPnl,
  };
}

/** Vốn mới bỏ thêm trong kỳ (sau periodStart, đến date). */
function netCapitalFlowInPeriod(
  tx: Transaction,
  skipSnowballDeposit: boolean
): number {
  if (skipSnowballDeposit && isSnowballAutoDeposit(tx)) return 0;

  const gross = tx.quantity * tx.price;
  switch (tx.type) {
    case "BUY":
      return gross + tx.fee;
    case "SELL":
      return -(gross - tx.fee);
    case "DEPOSIT":
      return gross;
    case "WITHDRAW":
      return -gross;
    default:
      return 0;
  }
}

function hasTradeTransactions(transactions: Transaction[]): boolean {
  return transactions.some((t) => t.type === "BUY" || t.type === "SELL");
}

/**
 * Lãi ròng danh mục trên vốn cost đầu kỳ (cố định):
 * profit(t) = NAV(t) − NAV đầu kỳ − vốn mới bỏ thêm trong kỳ
 * % = profit / cost đầu kỳ × 100, chart mốc 100 = đầu kỳ
 *
 * S&P: % tăng chỉ số thuần từ đầu kỳ.
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  window?: { from: string; to: string; clampedToHistory?: boolean }
): ComparisonResult | null {
  const curve = ensureEquityCurve(equityCurve);
  if (curve.length < 2 || benchmark.length < 1) return null;

  const sortedEquity = [...curve].sort((a, b) => a.date.localeCompare(b.date));
  const portfolioStart = portfolioInceptionDate(curve, transactions);
  const requestedStart = window?.from ?? portfolioStart;
  const startDate =
    requestedStart < portfolioStart ? portfolioStart : requestedStart;
  const endDate =
    window?.to ?? sortedEquity[sortedEquity.length - 1].date.slice(0, 10);
  const clampedToHistory =
    window?.clampedToHistory ?? requestedStart < portfolioStart;

  const benchInRange = pickBenchmarkSeries(benchmark, startDate, endDate);
  if (benchInRange.length < 1) return null;

  const dates = benchInRange.map((b) => b.date);
  const equityByDate = forwardFillEquity(sortedEquity, dates);

  const period = resolvePeriodStart(dates, equityByDate, startDate);
  if (!period) return null;

  const { periodStart, startEquity } = period;
  const comparisonFrom =
    periodStart < portfolioStart ? portfolioStart : periodStart;
  const startBenchIdx = benchInRange.findIndex((b) => b.date >= periodStart);
  if (startBenchIdx < 0) return null;

  const benchFromStart = benchInRange.slice(startBenchIdx);
  const startBench = benchFromStart[0].close;
  if (startBench <= 0 || startEquity <= 0) return null;

  const sortedTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const skipSnowballDeposit = hasTradeTransactions(sortedTx);

  const opening = snapshotPortfolioAt(
    sortedTx,
    periodStart,
    skipSnowballDeposit
  );
  const openingCost =
    opening.holdingsCost > 0 ? opening.holdingsCost : startEquity;
  const openingNav = startEquity;

  let txIdx = 0;
  while (txIdx < sortedTx.length) {
    const txDate = sortedTx[txIdx].date.slice(0, 10);
    if (txDate > periodStart) break;
    txIdx++;
  }

  let cumulativeFlow = 0;

  const dailyPoints: ComparisonPoint[] = benchFromStart.map((b) => {
    while (txIdx < sortedTx.length) {
      const txDate = sortedTx[txIdx].date.slice(0, 10);
      if (txDate > b.date) break;
      if (txDate > periodStart) {
        cumulativeFlow += netCapitalFlowInPeriod(
          sortedTx[txIdx],
          skipSnowballDeposit
        );
      }
      txIdx++;
    }

    const nav = equityByDate.get(b.date) ?? openingNav;
    const netProfit = nav - openingNav - cumulativeFlow;
    const portfolio =
      openingCost > 0 ? 100 + (netProfit / openingCost) * 100 : 100;

    return {
      date: b.date,
      portfolio,
      sp500: indexFromStart(b.close, startBench),
    };
  });

  if (dailyPoints.length < 1) return null;

  const points = downsampleMonthly(dailyPoints);
  const last = dailyPoints[dailyPoints.length - 1];
  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: openingCost,
    from: comparisonFrom,
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
