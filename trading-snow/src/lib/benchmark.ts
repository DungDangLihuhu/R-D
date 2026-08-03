import type { Transaction } from "./types";
import type { HistoryPoint } from "./yahoo";
import { downsampleMonthly } from "./format";

export type BenchmarkRange = "ytd" | "6m" | "1y" | "5y" | "all";

export interface ComparisonPoint {
  date: string;
  portfolio: number | null;
  sp500: number;
}

export interface ComparisonResult {
  points: ComparisonPoint[];
  /** (lãi đã chốt + lãi đang hold) / cost CP đang mở × 100 tại cuối kỳ */
  portfolioReturn: number;
  sp500Return: number;
  outperformance: number;
  holdingsCost: number;
  realizedPnl: number;
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

function txDay(date: string): string {
  return date.slice(0, 10);
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
  transactions: Transaction[];
  marketPrices: Record<string, number>;
}

interface PositionState {
  quantity: number;
  totalCost: number;
}

interface ReplaySnapshot {
  openCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
  returnPct: number | null;
}

function applyTrade(
  tx: Transaction,
  positions: Map<string, PositionState>,
  lastPrices: Map<string, number>,
  realizedPnl: { value: number }
): void {
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
      realizedPnl.value += proceeds - costBasis;

      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
      pos.totalCost = Math.max(0, pos.totalCost - costBasis);
      positions.set(tx.symbol, pos);
      lastPrices.set(tx.symbol, tx.price);
      break;
    }
  }
}

function snapshotAtDate(
  positions: Map<string, PositionState>,
  lastPrices: Map<string, number>,
  realizedPnl: number,
  marketPrices: Record<string, number>,
  useMarket: boolean,
  lastValidReturn: number
): ReplaySnapshot {
  let openCost = 0;
  let holdingsValue = 0;

  for (const [symbol, pos] of positions) {
    if (pos.quantity <= 0.000001) continue;
    openCost += pos.totalCost;
    const avgCost = pos.totalCost / pos.quantity;
    const price =
      useMarket && marketPrices[symbol] != null
        ? marketPrices[symbol]
        : lastPrices.get(symbol) ?? avgCost;
    holdingsValue += pos.quantity * price;
  }

  const unrealizedPnl = holdingsValue - openCost;

  if (openCost > 0) {
    const returnPct = ((realizedPnl + unrealizedPnl) / openCost) * 100;
    return {
      openCost,
      realizedPnl,
      unrealizedPnl,
      returnPct,
    };
  }

  if (realizedPnl !== 0) {
    return {
      openCost: 0,
      realizedPnl,
      unrealizedPnl: 0,
      returnPct: lastValidReturn,
    };
  }

  return {
    openCost: 0,
    realizedPnl,
    unrealizedPnl: 0,
    returnPct: null,
  };
}

function buildPortfolioReturnSeries(
  transactions: Transaction[],
  dates: string[],
  marketPrices: Record<string, number>
): ReplaySnapshot[] {
  const sorted = [...transactions]
    .filter((t) => t.type === "BUY" || t.type === "SELL")
    .sort((a, b) => a.date.localeCompare(b.date));

  const positions = new Map<string, PositionState>();
  const lastPrices = new Map<string, number>();
  const realized = { value: 0 };
  let txIdx = 0;
  let lastValidReturn = 0;

  const lastDate = dates[dates.length - 1] ?? "";

  return dates.map((date) => {
    while (txIdx < sorted.length && txDay(sorted[txIdx].date) <= date) {
      applyTrade(sorted[txIdx], positions, lastPrices, realized);
      txIdx++;
    }

    const snap = snapshotAtDate(
      positions,
      lastPrices,
      realized.value,
      marketPrices,
      date === lastDate,
      lastValidReturn
    );

    if (snap.returnPct != null) {
      lastValidReturn = snap.returnPct;
    }

    return snap;
  });
}

/**
 * S&P 500: % tăng chỉ số theo timeframe.
 * Danh mục: (lãi đã chốt + lãi đang hold) / cost CP đang mở tại từng ngày.
 */
export function buildBenchmarkComparison(
  portfolio: PortfolioBenchmarkInput,
  benchmark: HistoryPoint[],
  window: { from: string; to: string; clampedToHistory?: boolean },
  range: BenchmarkRange = "all"
): ComparisonResult | null {
  if (benchmark.length < 1) return null;
  if (portfolio.transactions.length === 0) return null;

  const benchInRange = pickBenchmarkSeries(
    benchmark,
    window.from,
    window.to
  );
  if (benchInRange.length < 2) return null;

  const baseClose = benchInRange[0].close;
  if (baseClose <= 0) return null;

  const dates = benchInRange.map((b) => b.date);
  const portfolioSnaps = buildPortfolioReturnSeries(
    portfolio.transactions,
    dates,
    portfolio.marketPrices
  );

  const hasPortfolioData = portfolioSnaps.some((s) => s.returnPct != null);
  if (!hasPortfolioData) return null;

  const rebaseToWindow = range !== "all";
  const basePortfolioReturn = rebaseToWindow
    ? (portfolioSnaps.find((s) => s.returnPct != null)?.returnPct ?? 0)
    : 0;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b, i) => {
    const snap = portfolioSnaps[i];
    return {
      date: b.date,
      sp500: (b.close / baseClose) * 100,
      portfolio:
        snap.returnPct != null
          ? 100 + (snap.returnPct - basePortfolioReturn)
          : null,
    };
  });

  const points = downsampleMonthly(rawPoints);
  const lastSnap = [...portfolioSnaps].reverse().find((s) => s.returnPct != null);
  const lastPoint = rawPoints[rawPoints.length - 1];
  const sp500Return = lastPoint.sp500 - 100;
  const portfolioReturn = rebaseToWindow
    ? (lastSnap?.returnPct ?? 0) - basePortfolioReturn
    : lastSnap?.returnPct ?? 0;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    holdingsCost: lastSnap?.openCost ?? 0,
    realizedPnl: lastSnap?.realizedPnl ?? 0,
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

export function hasBenchmarkTradingData(transactions: Transaction[]): boolean {
  return transactions.some((t) => t.type === "BUY" || t.type === "SELL");
}
