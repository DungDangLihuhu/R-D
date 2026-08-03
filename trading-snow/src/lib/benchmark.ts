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

function lookupBenchmarkPrice(benchmark: HistoryPoint[], date: string): number {
  let price = 0;
  for (const point of benchmark) {
    if (point.date > date) break;
    price = point.close;
  }
  return price;
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

interface MirrorState {
  spyShares: number;
  /** Net vốn còn trong chiến lược: BUY/Deposit in, SELL/Withdraw out. */
  netCapital: number;
  /** Tổng vốn từng bỏ vào (không giảm khi SELL). */
  totalContributed: number;
}

function createMirrorState(): MirrorState {
  return { spyShares: 0, netCapital: 0, totalContributed: 0 };
}

/** Mirror cash flow vào S&P: cùng số tiền, cùng thời điểm. */
function applyMirrorFlow(
  state: MirrorState,
  tx: Transaction,
  spyPrice: number,
  hasTrades: boolean,
  skipSnowballDeposit: boolean
): void {
  if (spyPrice <= 0) return;
  if (skipSnowballDeposit && isSnowballAutoDeposit(tx)) return;

  const gross = tx.quantity * tx.price;

  if (hasTrades) {
    switch (tx.type) {
      case "BUY": {
        const cost = gross + tx.fee;
        state.netCapital += cost;
        state.totalContributed += cost;
        state.spyShares += cost / spyPrice;
        break;
      }
      case "SELL": {
        const proceeds = gross - tx.fee;
        state.netCapital -= proceeds;
        state.spyShares = Math.max(0, state.spyShares - proceeds / spyPrice);
        break;
      }
      case "DIVIDEND": {
        const amount = gross - tx.fee;
        if (amount > 0) state.spyShares += amount / spyPrice;
        break;
      }
    }
  } else {
    switch (tx.type) {
      case "DEPOSIT":
        state.netCapital += gross;
        state.totalContributed += gross;
        state.spyShares += gross / spyPrice;
        break;
      case "WITHDRAW": {
        const amount = Math.min(gross, state.spyShares * spyPrice);
        state.netCapital -= gross;
        state.spyShares = Math.max(0, state.spyShares - amount / spyPrice);
        break;
      }
      case "DIVIDEND": {
        const amount = gross - tx.fee;
        if (amount > 0) state.spyShares += amount / spyPrice;
        break;
      }
    }
  }
}

function investedDenominator(state: MirrorState): number {
  if (state.netCapital > 0) return state.netCapital;
  if (state.totalContributed > 0) return state.totalContributed;
  return 0;
}

function toReturnIndex(value: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return (value / denominator) * 100;
}

function rebasePoints(points: ComparisonPoint[]): ComparisonPoint[] {
  if (points.length < 2) return points;
  const p0 = points[0].portfolio;
  const s0 = points[0].sp500;
  if (p0 <= 0 || s0 <= 0) return points;
  return points.map((p) => ({
    date: p.date,
    portfolio: (p.portfolio / p0) * 100,
    sp500: (p.sp500 / s0) * 100,
  }));
}

/**
 * So sánh trade vs S&P 500 với cùng dòng tiền:
 * mỗi BUY/Deposit → mua chỉ số; mỗi SELL/Withdraw → bán chỉ số.
 * Chart: giá trị / vốn bỏ ra (100 = hoà vốn).
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  currentTradingValue: number,
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

  const dates = benchInRange.map((b) => b.date);
  const equityByDate = forwardFillEquity(curve, dates);
  const today = toDateStr(new Date());

  const mirror = createMirrorState();
  let txIdx = 0;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b) => {
    while (txIdx < sortedTx.length) {
      const txDate = sortedTx[txIdx].date.slice(0, 10);
      if (txDate > b.date) break;
      const spyPrice = lookupBenchmarkPrice(sortedBenchmark, txDate);
      applyMirrorFlow(
        mirror,
        sortedTx[txIdx],
        spyPrice,
        hasTrades,
        skipSnowballDeposit
      );
      txIdx++;
    }

    const denominator = investedDenominator(mirror);
    let portfolioNav = equityByDate.get(b.date) ?? 0;
    if (b.date >= today.slice(0, 10) && currentTradingValue > 0) {
      portfolioNav = currentTradingValue;
    }

    const spyNav = mirror.spyShares * b.close;

    if (denominator <= 0) {
      return { date: b.date, portfolio: 0, sp500: 0 };
    }

    return {
      date: b.date,
      portfolio: toReturnIndex(portfolioNav, denominator),
      sp500: toReturnIndex(spyNav, denominator),
    };
  });

  const firstValid = rawPoints.findIndex((p) => p.portfolio > 0 && p.sp500 > 0);
  if (firstValid < 0) return null;

  const trimmed = rawPoints.slice(firstValid);
  if (trimmed.length < 2) return null;

  const isAllRange = startDate === portfolioStart;
  const rebased =
    !isAllRange && trimmed.length > 1 ? rebasePoints(trimmed) : trimmed;
  const chartPoints = downsampleMonthly(rebased);
  const displayLast = rebased[rebased.length - 1];

  return {
    points: chartPoints,
    portfolioReturn: displayLast.portfolio - 100,
    sp500Return: displayLast.sp500 - 100,
    outperformance: displayLast.portfolio - displayLast.sp500,
    investedCapital: mirror.netCapital > 0 ? mirror.netCapital : mirror.totalContributed,
    from: trimmed[0].date,
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
