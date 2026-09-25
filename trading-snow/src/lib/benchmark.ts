import type { Transaction } from "./types";
import type { HistoryPoint } from "./yahoo";
import { downsampleMonthly } from "./format";
import { createCloseLookup, type CloseSeries } from "./price-history";
import { compareTransactionsChronologically } from "./transaction-order";

export type BenchmarkRange = "ytd" | "6m" | "1y" | "5y" | "all";

export interface ComparisonPoint {
  date: string;
  portfolio: number | null;
  sp500: number;
}

export interface ComparisonResult {
  points: ComparisonPoint[];
  /**
   * "twr": lợi nhuận theo thời gian (có giá lịch sử); "cost": (lãi chốt + lãi đang giữ) /
   * giá vốn đang mở — cách cũ, chỉ còn dùng khi không tải được giá lịch sử.
   */
  method: "twr" | "cost";
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
  /**
   * Giá đóng cửa lịch sử từng mã. Có thì vị thế được định giá theo giá thật ở mỗi ngày,
   * nên "Δ float trong kỳ" đúng là phần lãi phát sinh trong kỳ; không có thì dùng giá
   * khớp lệnh gần nhất (float mọi kỳ trước dồn hết vào ngày cuối).
   */
  priceHistory?: CloseSeries;
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
    case "SPLIT": {
      const pos = positions.get(tx.symbol);
      if (pos && tx.quantity > 0) pos.quantity *= tx.quantity;
      const last = lastPrices.get(tx.symbol);
      if (last != null && tx.quantity > 0) lastPrices.set(tx.symbol, last / tx.quantity);
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
  lastValidReturn: number,
  closeOnDay?: (symbol: string) => number | undefined
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
        : closeOnDay?.(symbol) ?? lastPrices.get(symbol) ?? avgCost;
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
  marketPrices: Record<string, number>,
  priceHistory?: CloseSeries
): ReplaySnapshot[] {
  const sorted = [...transactions]
    .filter((t) => t.type === "BUY" || t.type === "SELL" || t.type === "SPLIT")
    .sort(compareTransactionsChronologically);

  const positions = new Map<string, PositionState>();
  const lastPrices = new Map<string, number>();
  const realized = { value: 0 };
  let txIdx = 0;
  let lastValidReturn = 0;

  const lastDate = dates[dates.length - 1] ?? "";
  const closeAt = priceHistory ? createCloseLookup(priceHistory) : null;

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
      lastValidReturn,
      closeAt ? (symbol) => closeAt(symbol.toUpperCase(), date) : undefined
    );

    if (snap.returnPct != null) {
      lastValidReturn = snap.returnPct;
    }

    return snap;
  });
}

function periodPortfolioIndex(
  snap: ReplaySnapshot,
  startSnap: ReplaySnapshot
): number {
  const openCost =
    snap.openCost > 0 ? snap.openCost : startSnap.openCost > 0 ? startSnap.openCost : 0;
  if (openCost <= 0) return 100;

  const realizedInPeriod = snap.realizedPnl - startSnap.realizedPnl;
  const unrealizedInPeriod = snap.unrealizedPnl - startSnap.unrealizedPnl;
  const profit = realizedInPeriod + unrealizedInPeriod;
  return 100 + (profit / openCost) * 100;
}

function periodPortfolioReturnPct(
  snap: ReplaySnapshot,
  startSnap: ReplaySnapshot
): number {
  return periodPortfolioIndex(snap, startSnap) - 100;
}

/**
 * Chỉ số tăng trưởng theo thời gian (TWR, 1 = trước khi có vị thế) của phần cổ phiếu, trên
 * lưới các ngày có giá đóng cửa. Mỗi ngày: (giá trị cuối ngày + tiền bán + cổ tức) so với
 * (giá trị hôm trước + tiền mua), rồi nhân dồn. Dòng tiền vào/ra không làm lệch kết quả nên
 * so được với một chỉ số — cách quỹ đầu tư báo lợi nhuận. Cách cũ chia lãi cho giá vốn
 * đang mở, nên lãi của mã đã bán bị chia cho giá vốn của các mã còn lại.
 */
export function buildTwrGrowth(
  transactions: Transaction[],
  marketPrices: Record<string, number>,
  priceHistory: CloseSeries
): { dates: string[]; growth: (number | null)[] } {
  const grid = [
    ...new Set(Object.values(priceHistory).flatMap((points) => points.map((p) => p.date))),
  ].sort();
  const sorted = [...transactions]
    .filter((t) => t.type === "BUY" || t.type === "SELL" || t.type === "SPLIT" || t.type === "DIVIDEND")
    .sort(compareTransactionsChronologically);
  if (grid.length === 0 || sorted.length === 0) return { dates: [], growth: [] };

  // Lệnh trước ngày đầu có giá vẫn phải vào lưới: thêm ngày của lệnh đầu tiên.
  const firstDay = txDay(sorted[0].date);
  if (firstDay < grid[0]) grid.unshift(firstDay);

  const positions = new Map<string, PositionState>();
  const lastPrices = new Map<string, number>();
  const closeAt = createCloseLookup(priceHistory);
  const lastDate = grid[grid.length - 1];
  let txIdx = 0;
  let previousValue = 0;
  let growth: number | null = null;

  const values = grid.map((date) => {
    let bought = 0;
    let received = 0;
    while (txIdx < sorted.length && txDay(sorted[txIdx].date) <= date) {
      const tx = sorted[txIdx++];
      const gross = tx.quantity * tx.price;
      if (tx.type === "BUY") bought += gross + tx.fee;
      else if (tx.type === "SELL") received += gross - tx.fee;
      else if (tx.type === "DIVIDEND") received += gross - tx.fee;
      if (tx.type !== "DIVIDEND") applyTrade(tx, positions, lastPrices, { value: 0 });
    }

    let value = 0;
    for (const [symbol, pos] of positions) {
      if (pos.quantity <= 0.000001) continue;
      const price =
        date === lastDate && marketPrices[symbol] != null
          ? marketPrices[symbol]
          : closeAt(symbol.toUpperCase(), date) ?? lastPrices.get(symbol) ?? pos.totalCost / pos.quantity;
      value += pos.quantity * price;
    }

    // Tiền mua coi như vào đầu ngày, tiền bán và cổ tức ra cuối ngày (công thức TTWROR của
    // Portfolio Performance). Coi tiền mua vào cuối ngày thì một lệnh lớn khớp lệch giá đóng
    // cửa bị chia cho vị thế cũ nhỏ, làm lợi nhuận ngày đó vọt ra hàng chục %.
    const base = previousValue + bought;
    if (base > 0) growth = (growth ?? 1) * ((value + received) / base);
    previousValue = value;
    return growth;
  });

  return { dates: grid, growth: values };
}

/** Giá trị chỉ số tăng trưởng tại ngày gần nhất không sau `date`. */
function growthOn(twr: { dates: string[]; growth: (number | null)[] }, date: string): number | null {
  let lo = 0;
  let hi = twr.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (twr.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 ? twr.growth[found] : null;
}

/**
 * S&P 500: % tăng (gồm cổ tức nếu có giá điều chỉnh) theo timeframe.
 * Danh mục: lợi nhuận theo thời gian khi có giá lịch sử; không có thì lùi về
 * (lãi đã chốt + lãi đang giữ) / giá vốn đang mở.
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

  const benchValue = (p: HistoryPoint) => p.adjClose ?? p.close;
  const baseClose = benchValue(benchInRange[0]);
  if (baseClose <= 0) return null;

  const dates = benchInRange.map((b) => b.date);
  const portfolioSnaps = buildPortfolioReturnSeries(
    portfolio.transactions,
    dates,
    portfolio.marketPrices,
    portfolio.priceHistory
  );

  const hasPortfolioData = portfolioSnaps.some((s) => s.returnPct != null);
  if (!hasPortfolioData) return null;

  const rebaseToWindow = range !== "all";
  const startSnap =
    portfolioSnaps[0]?.returnPct != null
      ? portfolioSnaps[0]
      : portfolioSnaps.find((s) => s.returnPct != null);

  const history = portfolio.priceHistory;
  const twr =
    history && Object.keys(history).length > 0
      ? buildTwrGrowth(portfolio.transactions, portfolio.marketPrices, history)
      : null;
  const growthAt = twr ? dates.map((d) => growthOn(twr, d)) : null;
  const twrStart = growthAt?.find((g): g is number => g != null && g > 0) ?? null;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b, i) => {
    const snap = portfolioSnaps[i];
    const sp500 = (benchValue(b) / baseClose) * 100;

    let portfolio: number | null;
    if (growthAt && twrStart != null) {
      const g = growthAt[i];
      portfolio = g != null ? (g / twrStart) * 100 : null;
    } else if (!rebaseToWindow) {
      portfolio = snap.returnPct != null ? 100 + snap.returnPct : null;
    } else if (startSnap) {
      portfolio = periodPortfolioIndex(snap, startSnap);
    } else {
      portfolio = 100;
    }

    return { date: b.date, sp500, portfolio };
  });

  if (rebaseToWindow && rawPoints.length > 0) {
    rawPoints[0] = { ...rawPoints[0], sp500: 100 };
  }

  const points = downsampleMonthly(rawPoints);
  const lastSnap = [...portfolioSnaps].reverse().find((s) => s.returnPct != null);
  const lastPoint = rawPoints[rawPoints.length - 1];
  const sp500Return = lastPoint.sp500 - 100;
  const lastTwr = [...rawPoints].reverse().find((p) => p.portfolio != null)?.portfolio;
  const portfolioReturn =
    growthAt && twrStart != null && lastTwr != null
      ? lastTwr - 100
      : rebaseToWindow && lastSnap && startSnap
        ? periodPortfolioReturnPct(lastSnap, startSnap)
        : lastSnap?.returnPct ?? 0;

  return {
    method: growthAt && twrStart != null ? "twr" : "cost",
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
