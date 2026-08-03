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

interface PortfolioBook {
  positions: Map<string, PositionState>;
  lastPrices: Map<string, number>;
  cash: number;
}

function createPortfolioBook(): PortfolioBook {
  return { positions: new Map(), lastPrices: new Map(), cash: 0 };
}

function holdingsValue(book: PortfolioBook): number {
  let value = 0;
  for (const [symbol, pos] of book.positions) {
    if (pos.quantity <= 0) continue;
    const price =
      book.lastPrices.get(symbol) ?? pos.totalCost / pos.quantity;
    value += pos.quantity * price;
  }
  return value;
}

function portfolioNav(book: PortfolioBook): number {
  return book.cash + holdingsValue(book);
}

function applyPortfolioTx(
  book: PortfolioBook,
  tx: Transaction,
  hasTrades: boolean
): void {
  const gross = tx.quantity * tx.price;

  if (hasTrades) {
    switch (tx.type) {
      case "BUY": {
        const cost = gross + tx.fee;
        const pos = book.positions.get(tx.symbol) ?? {
          quantity: 0,
          totalCost: 0,
        };
        pos.quantity += tx.quantity;
        pos.totalCost += cost;
        book.positions.set(tx.symbol, pos);
        book.lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "SELL": {
        const pos = book.positions.get(tx.symbol) ?? {
          quantity: 0,
          totalCost: 0,
        };
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        const costBasis = avgCost * tx.quantity;
        const proceeds = gross - tx.fee;
        book.cash += proceeds;
        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - costBasis);
        book.positions.set(tx.symbol, pos);
        book.lastPrices.set(tx.symbol, tx.price);
        break;
      }
      case "DIVIDEND":
        book.cash += gross - tx.fee;
        break;
    }
    return;
  }

  switch (tx.type) {
    case "DEPOSIT":
      book.cash += gross;
      break;
    case "WITHDRAW":
      book.cash -= gross;
      break;
    case "DIVIDEND":
      book.cash += gross - tx.fee;
      break;
    case "BUY": {
      const cost = gross + tx.fee;
      book.cash -= cost;
      const pos = book.positions.get(tx.symbol) ?? {
        quantity: 0,
        totalCost: 0,
      };
      pos.quantity += tx.quantity;
      pos.totalCost += cost;
      book.positions.set(tx.symbol, pos);
      book.lastPrices.set(tx.symbol, tx.price);
      break;
    }
    case "SELL": {
      const pos = book.positions.get(tx.symbol) ?? {
        quantity: 0,
        totalCost: 0,
      };
      const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
      const costBasis = avgCost * tx.quantity;
      const proceeds = gross - tx.fee;
      book.cash += proceeds;
      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
      pos.totalCost = Math.max(0, pos.totalCost - costBasis);
      book.positions.set(tx.symbol, pos);
      book.lastPrices.set(tx.symbol, tx.price);
      break;
    }
  }
}

interface MirrorState {
  spyShares: number;
  cash: number;
  totalContributed: number;
}

function createMirrorState(): MirrorState {
  return { spyShares: 0, cash: 0, totalContributed: 0 };
}

function mirrorNav(state: MirrorState, spyPrice: number): number {
  return state.spyShares * spyPrice + state.cash;
}

function withdrawFromMirror(
  state: MirrorState,
  amount: number,
  spyPrice: number
): void {
  if (amount <= 0 || spyPrice <= 0) return;
  let remaining = amount;

  const fromCash = Math.min(state.cash, remaining);
  state.cash -= fromCash;
  remaining -= fromCash;

  if (remaining > 0 && state.spyShares > 0) {
    const sharesSold = Math.min(state.spyShares, remaining / spyPrice);
    state.spyShares -= sharesSold;
    remaining -= sharesSold * spyPrice;
  }
}

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
        state.totalContributed += cost;
        state.spyShares += cost / spyPrice;
        break;
      }
      case "SELL": {
        const proceeds = gross - tx.fee;
        if (state.spyShares > 0) {
          const sharesSold = Math.min(state.spyShares, proceeds / spyPrice);
          state.spyShares -= sharesSold;
        }
        state.cash += proceeds;
        break;
      }
      case "DIVIDEND": {
        const amount = gross - tx.fee;
        if (amount > 0) {
          state.cash += amount;
          state.spyShares += amount / spyPrice;
        }
        break;
      }
    }
  } else {
    switch (tx.type) {
      case "DEPOSIT": {
        const fromCash = Math.min(state.cash, gross);
        state.cash -= fromCash;
        const external = gross - fromCash;
        if (external > 0) state.totalContributed += external;
        state.spyShares += gross / spyPrice;
        break;
      }
      case "WITHDRAW":
        withdrawFromMirror(state, gross, spyPrice);
        break;
      case "DIVIDEND": {
        const amount = gross - tx.fee;
        if (amount > 0) {
          state.cash += amount;
          state.spyShares += amount / spyPrice;
        }
        break;
      }
    }
  }
}

interface NavSnapshot {
  date: string;
  portfolioNav: number;
}

function buildPortfolioSnapshots(
  transactions: Transaction[],
  benchDays: HistoryPoint[],
  currentPortfolioValue: number,
  hasTrades: boolean
): NavSnapshot[] {
  const book = createPortfolioBook();
  const sortedTx = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  let txIdx = 0;
  const today = toDateStr(new Date());
  const snapshots: NavSnapshot[] = [];

  for (const day of benchDays) {
    while (txIdx < sortedTx.length) {
      const txDate = sortedTx[txIdx].date.slice(0, 10);
      if (txDate > day.date) break;
      applyPortfolioTx(book, sortedTx[txIdx], hasTrades);
      txIdx++;
    }

    let nav = portfolioNav(book);
    if (day.date >= today && currentPortfolioValue > 0) {
      nav = currentPortfolioValue;
    }
    snapshots.push({ date: day.date, portfolioNav: nav });
  }

  return snapshots;
}

/** Nội suy NAV danh mục giữa các lệnh theo biến động SPY. */
function interpolatePortfolioNav(
  snapshots: NavSnapshot[],
  benchDays: HistoryPoint[]
): Map<string, number> {
  const txNavByDate = new Map(
    snapshots.map((s) => [s.date, s.portfolioNav] as const)
  );
  const result = new Map<string, number>();

  const anchorDates = snapshots
    .filter((s, i, arr) => {
      if (i === 0) return true;
      return s.portfolioNav !== arr[i - 1].portfolioNav;
    })
    .map((s) => s.date);

  if (anchorDates.length === 0) {
    for (const day of benchDays) {
      result.set(day.date, snapshots[0]?.portfolioNav ?? 0);
    }
    return result;
  }

  const spyByDate = new Map(benchDays.map((b) => [b.date, b.close]));

  for (const day of benchDays) {
    const exact = txNavByDate.get(day.date);
    if (exact !== undefined) {
      result.set(day.date, exact);
      continue;
    }

    let prevDate = anchorDates[0];
    let nextDate = anchorDates[anchorDates.length - 1];

    for (let i = 0; i < anchorDates.length - 1; i++) {
      if (anchorDates[i] <= day.date && anchorDates[i + 1] >= day.date) {
        prevDate = anchorDates[i];
        nextDate = anchorDates[i + 1];
        break;
      }
    }

    if (day.date <= prevDate) {
      result.set(day.date, txNavByDate.get(prevDate) ?? 0);
      continue;
    }
    if (day.date >= nextDate) {
      result.set(day.date, txNavByDate.get(nextDate) ?? 0);
      continue;
    }

    const nav0 = txNavByDate.get(prevDate) ?? 0;
    const nav1 = txNavByDate.get(nextDate) ?? nav0;
    const spy0 = spyByDate.get(prevDate) ?? 0;
    const spy1 = spyByDate.get(nextDate) ?? spy0;
    const spyNow = spyByDate.get(day.date) ?? spy0;

    if (nav0 === nav1 || spy1 === spy0) {
      result.set(day.date, nav0);
      continue;
    }

    const ratio = (spyNow - spy0) / (spy1 - spy0);
    result.set(day.date, nav0 + ratio * (nav1 - nav0));
  }

  return result;
}

function toReturnIndex(value: number, contributed: number): number {
  if (contributed <= 0) return 100;
  return (value / contributed) * 100;
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
 * So sánh trade vs S&P 500 với cùng dòng tiền thật.
 * Mỗi vốn mới bỏ ra → mua SPY; SELL/Withdraw → bán + giữ cash.
 * Chỉ số = tổng giá trị / tổng vốn đã bỏ vào (100 = hoà vốn).
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  currentPortfolioValue: number,
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

  const portfolioSnapshots = buildPortfolioSnapshots(
    sortedTx,
    benchInRange,
    currentPortfolioValue,
    hasTrades
  );
  const portfolioByDate = interpolatePortfolioNav(
    portfolioSnapshots,
    benchInRange
  );

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

    const contributed = mirror.totalContributed;
    if (contributed <= 0) {
      return { date: b.date, portfolio: 0, sp500: 0 };
    }

    const portfolioNavValue = portfolioByDate.get(b.date) ?? 0;
    const spyNavValue = mirrorNav(mirror, b.close);

    return {
      date: b.date,
      portfolio: toReturnIndex(portfolioNavValue, contributed),
      sp500: toReturnIndex(spyNavValue, contributed),
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
    investedCapital: mirror.totalContributed,
    from: trimmed[0].date,
    to: endDate,
    clampedToHistory,
  };
}

export function extendBenchmarkFrom(from: string, days = 14): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}
