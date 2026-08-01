import type { HistoryPoint } from "./yahoo";

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

export function buildBenchmarkComparison(
  equityCurve: { date: string; equity: number }[],
  benchmark: HistoryPoint[]
): ComparisonResult | null {
  if (equityCurve.length < 2 || benchmark.length < 2) return null;

  const sortedEquity = [...equityCurve].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const startDate = sortedEquity[0].date.slice(0, 10);
  const endDate = sortedEquity[sortedEquity.length - 1].date.slice(0, 10);

  const benchInRange = benchmark.filter(
    (b) => b.date >= startDate && b.date <= endDate
  );
  if (benchInRange.length < 2) return null;

  const dates = benchInRange.map((b) => b.date);
  const equityByDate = forwardFillEquity(sortedEquity, dates);

  const startEquity = equityByDate.get(dates[0]) ?? 0;
  const startBench = benchInRange[0].close;
  if (startEquity <= 0 || startBench <= 0) return null;

  const points: ComparisonPoint[] = benchInRange.map((b) => {
    const equity = equityByDate.get(b.date) ?? startEquity;
    return {
      date: b.date,
      portfolio: (equity / startEquity) * 100,
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
  };
}
