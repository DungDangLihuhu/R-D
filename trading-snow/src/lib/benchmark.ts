import type { Transaction } from "./types";
import type { ExDividend, HistoryPoint } from "./yahoo";
import { downsampleMonthly, downsampleWeekly } from "./format";
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
  /** Phiên chốt giá gốc: lợi nhuận tính từ giá đóng cửa của phiên này. */
  from: string;
  to: string;
  /** Khung dài hơn lịch sử danh mục: cả hai tính từ phiên trước lệnh mua đầu tiên. */
  clampedToHistory: boolean;
  /**
   * Cùng dòng tiền (cách Snowball so sánh): mỗi lệnh mua/bán trong kỳ là mua/bán S&P 500
   * cùng số tiền, cùng ngày; đầu kỳ đang cầm cổ phiếu thì coi như cầm S&P cùng giá trị.
   * Chỉ có khi tải được giá lịch sử.
   */
  sameCashFlows?: {
    /** Lãi trong kỳ của danh mục: giá trị cuối + tiền bán + cổ tức − giá trị đầu − tiền mua. */
    profit: number;
    /** Lãi trong kỳ nếu cùng dòng tiền đó mua/bán S&P 500. */
    benchmarkProfit: number;
  };
}

export const BENCHMARK_RANGES: { value: BenchmarkRange; label: string }[] = [
  { value: "ytd", label: "YTD" },
  { value: "6m", label: "6 tháng" },
  { value: "1y", label: "1 năm" },
  { value: "5y", label: "5 năm" },
  { value: "all", label: "Tất cả" },
];

/** Cùng ngày của `months` tháng trước; tháng đó ngắn hơn thì lấy ngày cuối tháng (31/8 → 28/2). */
function monthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/** Ngày lịch theo giờ máy, không phải UTC: 6 giờ sáng ở Việt Nam vẫn là hôm nay. */
function toDateStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
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

/**
 * `from` là ngày chốt giá gốc: lợi nhuận của kỳ tính từ giá đóng cửa của phiên cuối cùng
 * không sau ngày đó — YTD từ phiên cuối năm trước, 1 năm từ phiên gần nhất tới ngày này năm
 * ngoái, như Yahoo hay Google tính. "Tất cả" tính từ phiên trước lệnh đầu tiên để gồm cả
 * lãi/lỗ của chính ngày mua đầu.
 */
export function resolveBenchmarkWindow(
  equityCurve: { date: string; equity: number }[],
  range: BenchmarkRange,
  now = new Date(),
  transactions: Transaction[] = []
): { from: string; to: string; clampedToHistory: boolean } | null {
  const curve = ensureEquityCurve(equityCurve);
  const portfolioStart = portfolioInceptionDate(curve, transactions);
  if (!portfolioStart) return null;

  const portfolioEnd =
    curve.length > 0
      ? curve[curve.length - 1].date.slice(0, 10)
      : toDateStr(now);
  const today = toDateStr(now);
  const to = today > portfolioEnd ? today : portfolioEnd;
  const inception = dayBefore(portfolioStart);

  let requestedFrom: string;
  switch (range) {
    case "ytd":
      requestedFrom = `${now.getFullYear() - 1}-12-31`;
      break;
    case "6m":
      requestedFrom = toDateStr(monthsBefore(now, 6));
      break;
    case "1y":
      requestedFrom = toDateStr(monthsBefore(now, 12));
      break;
    case "5y":
      requestedFrom = toDateStr(monthsBefore(now, 60));
      break;
    case "all":
    default:
      requestedFrom = inception;
      break;
  }

  const clampedToHistory = requestedFrom < inception;
  return { from: clampedToHistory ? inception : requestedFrom, to, clampedToHistory };
}

/** Phiên gốc là phiên cuối cùng không sau `from`, rồi mọi phiên tới `to`. */
function pickBenchmarkSeries(
  benchmark: HistoryPoint[],
  from: string,
  to: string
): HistoryPoint[] {
  const upToEnd = benchmark
    .filter((b) => b.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upToEnd.length === 0) return [];

  let base = 0;
  for (let i = 0; i < upToEnd.length && upToEnd[i].date <= from; i++) base = i;
  const series = upToEnd.slice(base);
  // Chưa có phiên nào sau phiên gốc (vd. ngày 1/1): kỳ chưa có biến động.
  return series.length === 1 ? [series[0], { ...series[0], date: to }] : series;
}

/** Tới khoảng 1 năm vẽ từng phiên; dài hơn một điểm mỗi tuần, rất dài một điểm mỗi tháng. */
function chartPoints(points: ComparisonPoint[]): ComparisonPoint[] {
  const MAX_POINTS = 300;
  if (points.length <= MAX_POINTS) return points;
  const weekly = downsampleWeekly(points);
  return weekly.length <= MAX_POINTS ? weekly : downsampleMonthly(points);
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
 * Tỷ lệ thuế khấu trừ trên cổ tức của chính danh mục (phí ghi trên lệnh cổ tức / cổ tức
 * gộp), ưu tiên mã niêm yết USD. Nhà đầu tư Việt Nam bị Mỹ giữ 30%; cổ tức S&P 500 trừ
 * cùng mức đó thì hai bên tính cổ tức như nhau.
 */
export function dividendWithholdingRate(transactions: Transaction[]): number {
  const dividends = transactions.filter(
    (t) => t.type === "DIVIDEND" && t.symbol !== "CASH" && t.quantity * t.price > 0
  );
  const usd = dividends.filter((t) => !t.currency || t.currency === "USD");
  const pool = usd.length > 0 ? usd : dividends;
  const gross = pool.reduce((sum, t) => sum + t.quantity * t.price, 0);
  const tax = pool.reduce((sum, t) => sum + Math.max(0, t.fee), 0);
  if (gross <= 0) return 0;
  return Math.min(0.5, tax / gross);
}

/**
 * Chuỗi tổng lợi nhuận của S&P 500 từ giá đóng cửa và cổ tức: mỗi lần không hưởng quyền,
 * cổ tức sau thuế được tái đầu tư. Không có dữ liệu cổ tức thì dùng giá điều chỉnh của Yahoo.
 */
export function benchmarkLevels(
  points: HistoryPoint[],
  dividends: ExDividend[] | undefined,
  withholding = 0
): HistoryPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (!dividends) return sorted.map((p) => ({ date: p.date, close: p.adjClose ?? p.close }));

  const byDate = new Map<string, number>();
  for (const d of dividends) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.amount);
  const out: HistoryPoint[] = [];
  let level = sorted[0]?.close ?? 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (i > 0) {
      const prev = sorted[i - 1].close;
      level *= (p.close + (1 - withholding) * (byDate.get(p.date) ?? 0)) / prev;
    }
    out.push({ date: p.date, close: level });
  }
  return out;
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
): { dates: string[]; growth: (number | null)[]; values: number[] } {
  const grid = [
    ...new Set(Object.values(priceHistory).flatMap((points) => points.map((p) => p.date))),
  ].sort();
  // Chỉ phần cổ phiếu: mua là tiền vào, bán và cổ tức là tiền ra. Nạp/rút và lãi tiền mặt
  // (cổ tức của CASH) không phải lợi nhuận của cổ phiếu nên bỏ qua.
  const sorted = [...transactions]
    .filter(
      (t) =>
        t.type === "BUY" ||
        t.type === "SELL" ||
        t.type === "SPLIT" ||
        (t.type === "DIVIDEND" && t.symbol !== "CASH")
    )
    .sort(compareTransactionsChronologically);
  if (grid.length === 0 || sorted.length === 0) return { dates: [], growth: [], values: [] };

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
  const values: number[] = [];

  const growthSeries = grid.map((date) => {
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
    values.push(value);
    return growth;
  });

  return { dates: grid, growth: growthSeries, values };
}

/** Vị trí của ngày gần nhất không sau `date` trong dãy ngày tăng dần; -1 khi chưa có. */
function indexOnOrBefore(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Giá trị chỉ số tăng trưởng tại ngày gần nhất không sau `date`. */
function growthOn(twr: { dates: string[]; growth: (number | null)[] }, date: string): number | null {
  const i = indexOnOrBefore(twr.dates, date);
  return i >= 0 ? twr.growth[i] : null;
}

/**
 * Cùng dòng tiền: đầu kỳ cầm S&P bằng giá trị cổ phiếu đang cầm, mỗi lệnh mua/bán trong kỳ
 * mua/bán S&P cùng số tiền theo giá đóng cửa hôm đó. Bán nhiều hơn phần S&P đang có thì vị
 * thế S&P âm — lãi vẫn so được (cách Long–Nickels), nên chỉ trả về lãi, không trả giá trị.
 */
function sameCashFlowProfits(
  transactions: Transaction[],
  twr: { dates: string[]; values: number[] },
  bench: HistoryPoint[],
  benchValue: (p: HistoryPoint) => number
): { profit: number; benchmarkProfit: number } | null {
  if (bench.length < 2 || twr.dates.length === 0) return null;
  const benchDates = bench.map((b) => b.date);
  const levelOn = (day: string) => {
    const i = indexOnOrBefore(benchDates, day);
    return benchValue(bench[Math.max(0, i)]);
  };
  const valueOn = (day: string) => {
    const i = indexOnOrBefore(twr.dates, day);
    return i >= 0 ? twr.values[i] : 0;
  };

  const start = benchDates[0];
  const end = benchDates[benchDates.length - 1];
  const startValue = valueOn(start);
  let units = startValue / levelOn(start);
  let invested = startValue;
  let dividends = 0;

  // Lệnh sau ngày định giá cuối chưa có trong giá trị cuối kỳ: bỏ qua cả hai bên.
  const lastValued = twr.dates[twr.dates.length - 1];
  for (const tx of transactions) {
    const day = txDay(tx.date);
    if (day <= start || day > lastValued || tx.symbol === "CASH") continue;
    const gross = tx.quantity * tx.price;
    if (tx.type === "BUY") {
      invested += gross + tx.fee;
      units += (gross + tx.fee) / levelOn(day);
    } else if (tx.type === "SELL") {
      invested -= gross - tx.fee;
      units -= (gross - tx.fee) / levelOn(day);
    } else if (tx.type === "DIVIDEND") {
      dividends += gross - tx.fee;
    }
  }

  // Giá trị cuối là điểm cuối của TWR (giá phiên chính mới nhất).
  const endValue = twr.values[twr.values.length - 1];
  return {
    profit: endValue + dividends - invested,
    benchmarkProfit: units * levelOn(end) - invested,
  };
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

  let benchInRange = pickBenchmarkSeries(benchmark, window.from, window.to);
  if (benchInRange.length < 2) return null;

  const history = portfolio.priceHistory;
  const twr =
    history && Object.keys(history).length > 0
      ? buildTwrGrowth(portfolio.transactions, portfolio.marketPrices, history)
      : null;
  let growthAt: (number | null)[] | null = twr
    ? benchInRange.map((b) => growthOn(twr, b.date))
    : null;
  let clampedToHistory = window.clampedToHistory ?? false;

  if (growthAt && growthAt[0] == null) {
    const first = growthAt.findIndex((g) => g != null);
    if (first < 0) {
      growthAt = null;
    } else if (first > 1) {
      // Lệnh mua đầu tiên nằm giữa kỳ: cả hai tính từ phiên ngay trước ngày đó, không thì
      // S&P được cộng thêm cả quãng danh mục chưa có cổ phiếu nào.
      benchInRange = benchInRange.slice(first - 1);
      growthAt = growthAt.slice(first - 1);
      clampedToHistory = true;
    }
  }

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
  if (!growthAt && !hasPortfolioData) return null;

  const rebaseToWindow = range !== "all";
  const startSnap =
    portfolioSnaps[0]?.returnPct != null
      ? portfolioSnaps[0]
      : portfolioSnaps.find((s) => s.returnPct != null);
  // Phiên gốc trước lệnh mua đầu tiên: danh mục chưa có gì, chỉ số tăng trưởng là 1.
  const twrBase = growthAt ? (growthAt[0] ?? 1) : null;

  const rawPoints: ComparisonPoint[] = benchInRange.map((b, i) => {
    const snap = portfolioSnaps[i];
    const sp500 = (benchValue(b) / baseClose) * 100;

    let portfolio: number | null;
    if (growthAt && twrBase != null) {
      const g = growthAt[i] ?? (i === 0 ? twrBase : null);
      portfolio = g != null ? (g / twrBase) * 100 : null;
    } else if (!rebaseToWindow) {
      portfolio = snap.returnPct != null ? 100 + snap.returnPct : null;
    } else if (startSnap) {
      portfolio = periodPortfolioIndex(snap, startSnap);
    } else {
      portfolio = 100;
    }

    return { date: b.date, sp500, portfolio };
  });

  const sameCashFlows =
    twr && growthAt ? sameCashFlowProfits(portfolio.transactions, twr, benchInRange, benchValue) : null;

  const lastSnap = [...portfolioSnaps].reverse().find((s) => s.returnPct != null);
  const lastPoint = rawPoints[rawPoints.length - 1];
  const sp500Return = lastPoint.sp500 - 100;
  const lastTwr = [...rawPoints].reverse().find((p) => p.portfolio != null)?.portfolio;
  const portfolioReturn =
    growthAt && lastTwr != null
      ? lastTwr - 100
      : rebaseToWindow && lastSnap && startSnap
        ? periodPortfolioReturnPct(lastSnap, startSnap)
        : lastSnap?.returnPct ?? 0;

  return {
    method: growthAt ? "twr" : "cost",
    points: chartPoints(rawPoints),
    portfolioReturn,
    sp500Return,
    outperformance: portfolioReturn - sp500Return,
    holdingsCost: lastSnap?.openCost ?? 0,
    realizedPnl: lastSnap?.realizedPnl ?? 0,
    from: benchInRange[0].date,
    to: window.to,
    clampedToHistory,
    ...(sameCashFlows && { sameCashFlows }),
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
