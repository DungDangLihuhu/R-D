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

interface PositionState {
  quantity: number;
  totalCost: number;
}

interface PortfolioState {
  positions: Map<string, PositionState>;
  lastPrices: Map<string, number>;
  realizedPnl: number;
  netCapitalDeployed: number;
}

function createPortfolioState(): PortfolioState {
  return {
    positions: new Map(),
    lastPrices: new Map(),
    realizedPnl: 0,
    netCapitalDeployed: 0,
  };
}

function portfolioNav(state: PortfolioState): number {
  let holdingsValue = 0;
  for (const [symbol, pos] of state.positions) {
    if (pos.quantity <= 0) continue;
    const price =
      state.lastPrices.get(symbol) ?? pos.totalCost / pos.quantity;
    holdingsValue += pos.quantity * price;
  }
  return holdingsValue + state.realizedPnl;
}

function applyPortfolioTx(
  state: PortfolioState,
  tx: Transaction,
  hasTrades: boolean,
  skipSnowballDeposit: boolean
): void {
  if (skipSnowballDeposit && isSnowballAutoDeposit(tx)) return;

  const gross = tx.quantity * tx.price;

  if (hasTrades) {
    switch (tx.type) {
      case "BUY": {
        const cost = gross + tx.fee;
        state.netCapitalDeployed += cost;
        const pos = state.positions.get(tx.symbol) ?? {
          quantity: 0,
          totalCost: 0,
        };
        pos.quantity += tx.quantity;
        pos.totalCost += cost;
        state.positions.set(tx.symbol, pos);
        state.lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "SELL": {
        const pos = state.positions.get(tx.symbol) ?? {
          quantity: 0,
          totalCost: 0,
        };
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        const costBasis = avgCost * tx.quantity;
        const proceeds = gross - tx.fee;
        state.netCapitalDeployed -= proceeds;
        state.realizedPnl += proceeds - costBasis;
        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - costBasis);
        state.positions.set(tx.symbol, pos);
        state.lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "DIVIDEND":
        state.realizedPnl += gross - tx.fee;
        break;
    }
  } else {
    switch (tx.type) {
      case "DEPOSIT":
        state.netCapitalDeployed += gross;
        break;
      case "WITHDRAW":
        state.netCapitalDeployed -= gross;
        break;
      case "DIVIDEND":
        state.realizedPnl += gross - tx.fee;
        break;
    }
  }
}

interface SpyMirrorState {
  spyShares: number;
  netCapitalDeployed: number;
}

function createSpyMirror(): SpyMirrorState {
  return { spyShares: 0, netCapitalDeployed: 0 };
}

function applySpyMirrorFlow(
  state: SpyMirrorState,
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
        state.netCapitalDeployed += cost;
        state.spyShares += cost / spyPrice;
        break;
      }
      case "SELL": {
        const proceeds = gross - tx.fee;
        state.netCapitalDeployed -= proceeds;
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
        state.netCapitalDeployed += gross;
        state.spyShares += gross / spyPrice;
        break;
      case "WITHDRAW": {
        const amount = Math.min(gross, state.spyShares * spyPrice);
        state.netCapitalDeployed -= gross;
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

interface RawPoint {
  date: string;
  costNav: number;
  sp500: number;
  netCap: number;
  spyNetCap: number;
}

/** Daily return stripping net capital flows (TWR-style). */
function dailyReturnTwr(
  navPrev: number,
  navCurr: number,
  netCapPrev: number,
  netCapCurr: number
): number {
  if (navPrev <= 0) return 0;
  const flow = netCapCurr - netCapPrev;
  return (navCurr - flow) / navPrev - 1;
}

function buildCumulativeIndex(rawPoints: RawPoint[], firstIdx: number): ComparisonPoint[] {
  const points: ComparisonPoint[] = [];
  let portIdx = 100;
  let spyIdx = 100;

  for (let i = firstIdx; i < rawPoints.length; i++) {
    const raw = rawPoints[i];
    if (i === firstIdx) {
      points.push({ date: raw.date, portfolio: 100, sp500: 100 });
      continue;
    }
    const prev = rawPoints[i - 1];
    const portDaily = dailyReturnTwr(
      prev.costNav,
      raw.costNav,
      prev.netCap,
      raw.netCap
    );
    const spyDaily = dailyReturnTwr(
      prev.sp500,
      raw.sp500,
      prev.spyNetCap,
      raw.spyNetCap
    );
    portIdx *= 1 + portDaily;
    spyIdx *= 1 + spyDaily;
    points.push({ date: raw.date, portfolio: portIdx, sp500: spyIdx });
  }

  return points;
}

/**
 * Benchmark vs S&P 500 using compounded daily % returns (TWR).
 * Both series start at 100; each day applies portfolio vs SPY daily performance.
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
    window?.to ??
    curve[curve.length - 1].date.slice(0, 10);
  const clampedToHistory =
    window?.clampedToHistory ?? requestedStart < portfolioStart;

  const benchInRange = pickBenchmarkSeries(sortedBenchmark, startDate, endDate);
  if (benchInRange.length < 1) return null;

  const sortedTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const hasTrades = hasTradeTransactions(sortedTx);
  const skipSnowballDeposit = hasTrades;

  const portfolioState = createPortfolioState();
  const spyState = createSpyMirror();
  let txIdx = 0;

  const rawPoints: RawPoint[] = benchInRange.map((b) => {
    while (txIdx < sortedTx.length) {
      const txDate = sortedTx[txIdx].date.slice(0, 10);
      if (txDate > b.date) break;
      const spyPrice = lookupBenchmarkPrice(sortedBenchmark, txDate);
      applyPortfolioTx(
        portfolioState,
        sortedTx[txIdx],
        hasTrades,
        skipSnowballDeposit
      );
      applySpyMirrorFlow(
        spyState,
        sortedTx[txIdx],
        spyPrice,
        hasTrades,
        skipSnowballDeposit
      );
      txIdx++;
    }

    return {
      date: b.date,
      costNav: portfolioNav(portfolioState),
      sp500: spyState.spyShares * b.close,
      netCap: portfolioState.netCapitalDeployed,
      spyNetCap: spyState.netCapitalDeployed,
    };
  });

  if (rawPoints.length < 2) return null;

  const firstIdx = rawPoints.findIndex((p) => p.netCap > 0);
  if (firstIdx < 0 || firstIdx >= rawPoints.length - 1) return null;

  const dailyPoints = buildCumulativeIndex(rawPoints, firstIdx);
  const firstRaw = rawPoints[firstIdx];
  const lastRaw = rawPoints[rawPoints.length - 1];
  const last = dailyPoints[dailyPoints.length - 1];

  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  const points = downsampleMonthly(dailyPoints);
  const comparisonFrom =
    firstRaw.date < portfolioStart ? portfolioStart : firstRaw.date;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: lastRaw.netCap,
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
