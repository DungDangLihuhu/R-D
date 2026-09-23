import type { Transaction } from "./types";
import type { CloseHistory, HistoryPoint, SplitEvent } from "./yahoo";
import { compareTransactionsChronologically } from "./transaction-order";

/** Mã → giá đóng cửa ngày, tăng dần theo ngày, đã khớp cách ghi số cổ của người dùng. */
export type CloseSeries = Record<string, HistoryPoint[]>;

const DAY_MS = 86_400_000;
/** Lịch sử ngắn hơn ngưỡng này vẽ từng phiên; dài hơn thì một điểm mỗi tuần là đủ mịn. */
const DAILY_POINTS_MAX_DAYS = 180;

/** Giá thực tế từng ngày: Yahoo chia giá cũ cho mọi lần split về sau, ở đây nhân ngược lại. */
export function unadjustForSplits(
  points: HistoryPoint[],
  splits: SplitEvent[]
): HistoryPoint[] {
  if (splits.length === 0) return points;
  return points.map((p) => {
    let factor = 1;
    for (const s of splits) if (s.date > p.date) factor *= s.ratio;
    return factor === 1 ? p : { date: p.date, close: p.close * factor };
  });
}

function closeOnOrBefore(points: HistoryPoint[], day: string): number | undefined {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 ? points[found].close : undefined;
}

/**
 * Lệnh trước một lần split có thể được ghi theo giá khớp gốc (kèm lệnh SPLIT) hoặc theo
 * giá đã điều chỉnh như app broker hiện lại về sau. Số cổ trong app đi theo đúng cách ghi
 * đó, nên chọn chuỗi giá gần với chính giá lệnh đã ghi — chọn sai là lệch đúng bằng hệ
 * số split ở mọi ngày trước split.
 */
export function pickCloseSeries(
  history: CloseHistory,
  trades: Pick<Transaction, "type" | "date" | "price">[]
): HistoryPoint[] {
  const { points, splits } = history;
  if (splits.length === 0 || points.length === 0) return points;

  const actual = unadjustForSplits(points, splits);
  const lastSplit = splits.reduce((max, s) => (s.date > max ? s.date : max), splits[0].date);
  let actualVotes = 0;
  let adjustedVotes = 0;

  for (const tx of trades) {
    if ((tx.type !== "BUY" && tx.type !== "SELL") || !(tx.price > 0)) continue;
    const day = tx.date.slice(0, 10);
    if (day >= lastSplit) continue;
    const adjustedClose = closeOnOrBefore(points, day);
    const actualClose = closeOnOrBefore(actual, day);
    if (!adjustedClose || !actualClose) continue;
    const offAdjusted = Math.abs(Math.log(tx.price / adjustedClose));
    const offActual = Math.abs(Math.log(tx.price / actualClose));
    if (offActual < offAdjusted) actualVotes++;
    else if (offAdjusted < offActual) adjustedVotes++;
  }

  return actualVotes > adjustedVotes ? actual : points;
}

/** Giá đóng cửa gần nhất ≤ ngày của từng mã. Các lần gọi cho một mã phải theo ngày tăng dần. */
export function createCloseLookup(series: CloseSeries) {
  const cursors = new Map<string, number>();
  return (symbol: string, day: string): number | undefined => {
    const points = series[symbol];
    if (!points || points.length === 0) return undefined;
    let i = cursors.get(symbol) ?? -1;
    while (i + 1 < points.length && points[i + 1].date <= day) i++;
    cursors.set(symbol, i);
    return i >= 0 ? points[i].close : undefined;
  };
}

function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

function evaluationDays(series: CloseSeries, startDay: string, today: string): string[] {
  const days = new Set<string>();
  for (const points of Object.values(series)) {
    for (const p of points) {
      if (p.date >= startDay && p.date < today) days.add(p.date);
    }
  }
  const sorted = [...days].sort();
  const spanDays = (Date.parse(today) - Date.parse(startDay)) / DAY_MS;
  const sampled =
    spanDays <= DAILY_POINTS_MAX_DAYS
      ? sorted
      : sorted.filter(
          (day, i) => i === sorted.length - 1 || weekStart(sorted[i + 1]) !== weekStart(day)
        );
  return sampled[0] === startDay ? sampled : [startDay, ...sampled];
}

/**
 * Lợi nhuận ròng theo thời gian, định giá vị thế bằng giá đóng cửa thật của từng phiên
 * (cuối tuần khi lịch sử dài): lãi đã chốt + cổ tức − phí + (giá trị vị thế − giá vốn).
 * Nạp/rút tiền không phải lợi nhuận nên không vào đường này. Điểm cuối là đúng con số
 * lợi nhuận đang hiện trên thẻ, tính bằng giá realtime.
 */
export function buildMarketProfitCurve(
  transactions: Transaction[],
  series: CloseSeries,
  finalProfit: number,
  now = new Date()
): { date: string; value: number }[] | null {
  const sorted = [...transactions].sort(compareTransactionsChronologically);
  if (!sorted.some((t) => t.type === "BUY")) return null;
  if (Object.values(series).every((points) => points.length === 0)) return null;

  const today = now.toISOString().slice(0, 10);
  const days = evaluationDays(series, sorted[0].date.slice(0, 10), today);
  const closeAt = createCloseLookup(series);

  const positions = new Map<string, { quantity: number; totalCost: number }>();
  const lastTradePrice = new Map<string, number>();
  let tradeCash = 0;
  let txIdx = 0;
  const curve: { date: string; value: number }[] = [];

  const apply = (tx: Transaction) => {
    const symbol = tx.symbol.toUpperCase();
    const gross = tx.quantity * tx.price;
    const pos = positions.get(symbol) ?? { quantity: 0, totalCost: 0 };
    switch (tx.type) {
      case "BUY":
        tradeCash -= gross + tx.fee;
        pos.quantity += tx.quantity;
        pos.totalCost += gross + tx.fee;
        positions.set(symbol, pos);
        lastTradePrice.set(symbol, tx.price);
        break;
      case "SELL": {
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        tradeCash += gross - tx.fee;
        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - avgCost * tx.quantity);
        positions.set(symbol, pos);
        lastTradePrice.set(symbol, tx.price);
        break;
      }
      case "DIVIDEND":
        tradeCash += gross - tx.fee;
        break;
      case "SPLIT": {
        if (tx.quantity <= 0) break;
        pos.quantity *= tx.quantity;
        const last = lastTradePrice.get(symbol);
        if (last != null) lastTradePrice.set(symbol, last / tx.quantity);
        break;
      }
    }
  };

  for (const day of days) {
    while (txIdx < sorted.length && sorted[txIdx].date.slice(0, 10) <= day) {
      apply(sorted[txIdx]);
      txIdx++;
    }
    let holdingsValue = 0;
    for (const [symbol, pos] of positions) {
      if (pos.quantity <= 1e-9) continue;
      const price =
        closeAt(symbol, day) ?? lastTradePrice.get(symbol) ?? pos.totalCost / pos.quantity;
      holdingsValue += pos.quantity * price;
    }
    curve.push({ date: day, value: holdingsValue + tradeCash });
  }

  curve.push({ date: now.toISOString(), value: finalProfit });
  return curve;
}
