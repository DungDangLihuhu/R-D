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

/**
 * Compare portfolio vs S&P 500 from period start:
 * - Vốn mốc = NAV danh mục tại ngày đầu kỳ (không cộng nạp/rút sau đó)
 * - Danh mục: NAV điều chỉnh (bỏ ảnh hưởng nạp/rút) — phản ánh lãi/lỗ đã chốt + chưa chốt
 * - S&P: mua giữ từ đầu kỳ với cùng vốn mốc
 * - Cả hai chuẩn hóa = 100 tại ngày đầu kỳ
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

  const periodStart = dates[0];
  const startBench = benchInRange[0].close;
  const startEquity = adjustedEquity(
    equityByDate.get(periodStart) ?? 0,
    transactions,
    periodStart,
    periodStart
  );

  if (startEquity <= 0 || startBench <= 0) return null;

  const points: ComparisonPoint[] = benchInRange.map((b) => {
    const raw = equityByDate.get(b.date) ?? startEquity;
    const adj = adjustedEquity(raw, transactions, periodStart, b.date);

    return {
      date: b.date,
      portfolio: (adj / startEquity) * 100,
      sp500: (b.close / startBench) * 100,
    };
  });

  const last = points[points.length - 1];
  const portfolioReturn = last.portfolio - 100;
  const sp500Return = last.sp500 - 100;

  return {
    points,
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    investedCapital: startEquity,
    from: startDate,
    to: endDate,
  };
}
