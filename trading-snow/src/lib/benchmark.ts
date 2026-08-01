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

/** Resolve comparison window; clamps to portfolio history */
export function resolveBenchmarkWindow(
  equityCurve: { date: string; equity: number }[],
  range: BenchmarkRange,
  now = new Date()
): { from: string; to: string } | null {
  if (equityCurve.length < 2) return null;

  const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
  const portfolioStart = sorted[0].date.slice(0, 10);
  const portfolioEnd = sorted[sorted.length - 1].date.slice(0, 10);
  const to = portfolioEnd < toDateStr(now) ? portfolioEnd : toDateStr(now);

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
  if (from >= to) return null;

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

interface SimState {
  spyShares: number;
  investedCapital: number;
}

function applyMatchedSp500Flow(
  state: SimState,
  tx: Transaction,
  spyPrice: number
): void {
  if (spyPrice <= 0) return;

  const gross = tx.quantity * tx.price;

  switch (tx.type) {
    case "DEPOSIT":
      state.investedCapital += gross;
      state.spyShares += gross / spyPrice;
      break;
    case "WITHDRAW": {
      const amount = Math.min(gross, state.spyShares * spyPrice);
      state.investedCapital = Math.max(0, state.investedCapital - gross);
      state.spyShares = Math.max(0, state.spyShares - amount / spyPrice);
      break;
    }
    case "BUY": {
      const cost = gross + tx.fee;
      state.investedCapital += cost;
      state.spyShares += cost / spyPrice;
      break;
    }
    case "SELL": {
      const proceeds = gross - tx.fee;
      state.spyShares = Math.max(0, state.spyShares - proceeds / spyPrice);
      break;
    }
    case "DIVIDEND": {
      const amount = gross - tx.fee;
      if (amount > 0) state.spyShares += amount / spyPrice;
      break;
    }
  }
}

function simulateMatchedSp500(
  transactions: Transaction[],
  benchmark: HistoryPoint[],
  asOfDate: string
): SimState {
  const state: SimState = { spyShares: 0, investedCapital: 0 };
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    if (tx.date.slice(0, 10) > asOfDate) break;
    const spyPrice = lookupBenchmarkPrice(benchmark, tx.date.slice(0, 10));
    applyMatchedSp500Flow(state, tx, spyPrice);
  }

  return state;
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
 * Compare portfolio vs S&P 500 with matched cash flows:
 * each BUY/DEPOSIT buys SPY; each SELL/WITHDRAW sells SPY; dividends reinvested.
 * Chart: NAV / vốn bỏ ra (100 = hoà vốn). Sub-ranges rebase to 100 at period start.
 */
export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[],
  transactions: Transaction[],
  window?: { from: string; to: string }
): ComparisonResult | null {
  if (equityCurve.length < 2 || benchmark.length < 2) return null;

  const sortedEquity = [...equityCurve].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const startDate = window?.from ?? sortedEquity[0].date.slice(0, 10);
  const endDate =
    window?.to ?? sortedEquity[sortedEquity.length - 1].date.slice(0, 10);

  const benchInRange = benchmark.filter(
    (b) => b.date >= startDate && b.date <= endDate
  );
  if (benchInRange.length < 2) return null;

  const dates = benchInRange.map((b) => b.date);
  const equityByDate = forwardFillEquity(sortedEquity, dates);

  const endEquity = equityByDate.get(endDate) ?? 0;
  const endSim = simulateMatchedSp500(transactions, benchmark, endDate);

  if (endSim.investedCapital <= 0 || endEquity <= 0) return null;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b) => {
    const equity = equityByDate.get(b.date) ?? endEquity;
    const sim = simulateMatchedSp500(transactions, benchmark, b.date);
    const spyValue = sim.spyShares * b.close;
    const invested = sim.investedCapital;

    if (invested <= 0) {
      return { date: b.date, portfolio: 100, sp500: 100 };
    }

    return {
      date: b.date,
      portfolio: (equity / invested) * 100,
      sp500: (spyValue / invested) * 100,
    };
  });

  const portfolioStart = sortedEquity[0].date.slice(0, 10);
  const isAllRange = startDate === portfolioStart;
  const points = !isAllRange && rawPoints.length > 1 ? rebasePoints(rawPoints) : rawPoints;

  const last = points[points.length - 1];
  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: endSim.investedCapital,
    from: startDate,
    to: endDate,
  };
}
