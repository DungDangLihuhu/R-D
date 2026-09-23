import type { Transaction } from "./types";
import { compareTransactionsChronologically } from "./transaction-order";

export interface TradePnl {
  pnl: number;
  pnlPercent: number;
}

export interface TradeSummary {
  buyTotal: number;
  sellTotal: number;
  feeTotal: number;
}

export function computeTradeDisplay(
  transactions: Transaction[],
  portfolioId: string
): { pnlByTxId: Map<string, TradePnl>; summary: TradeSummary } {
  const sorted = [...transactions]
    .filter((t) => t.portfolioId === portfolioId)
    .sort(compareTransactionsChronologically);

  const positions = new Map<string, { quantity: number; totalCost: number }>();
  const pnlByTxId = new Map<string, TradePnl>();

  let buyTotal = 0;
  let sellTotal = 0;
  let feeTotal = 0;

  for (const tx of sorted) {
    const gross = tx.quantity * tx.price;
    feeTotal += tx.fee;

    switch (tx.type) {
      case "BUY":
        buyTotal += gross;
        {
          const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
          pos.quantity += tx.quantity;
          pos.totalCost += gross + tx.fee;
          positions.set(tx.symbol, pos);
        }
        break;
      case "SELL": {
        sellTotal += gross;
        const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        const costBasis = avgCost * tx.quantity;
        const proceeds = gross - tx.fee;
        const pnl = proceeds - costBasis;
        pnlByTxId.set(tx.id, {
          pnl,
          pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
        });
        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - costBasis);
        positions.set(tx.symbol, pos);
        break;
      }
      case "SPLIT": {
        const pos = positions.get(tx.symbol);
        if (pos && tx.quantity > 0) pos.quantity *= tx.quantity;
        break;
      }
    }
  }

  return {
    pnlByTxId,
    summary: { buyTotal, sellTotal, feeTotal },
  };
}

export function tradeGross(tx: Transaction): number {
  return tx.quantity * tx.price;
}

type PositionTx = Pick<Transaction, "portfolioId" | "type" | "symbol" | "quantity" | "date">;

export interface Oversell {
  symbol: string;
  date: string;
  sold: number;
  held: number;
}

/**
 * Lệnh bán vượt số cổ phiếu đang giữ tại thời điểm đó. Hay gặp khi file thiếu lệnh
 * mua hoặc có split chưa ghi — app vẫn tính được nhưng giá vốn phần vượt là đoán.
 */
export function findOversells(
  transactions: PositionTx[],
  portfolioId: string
): Oversell[] {
  const held = new Map<string, number>();
  const oversells: Oversell[] = [];
  const trades = transactions
    .filter(
      (t) =>
        t.portfolioId === portfolioId &&
        (t.type === "BUY" || t.type === "SELL" || t.type === "SPLIT")
    )
    .sort(compareTransactionsChronologically);

  for (const tx of trades) {
    const quantity = held.get(tx.symbol) ?? 0;
    if (tx.type === "BUY") {
      held.set(tx.symbol, quantity + tx.quantity);
      continue;
    }
    if (tx.type === "SPLIT") {
      if (tx.quantity > 0) held.set(tx.symbol, quantity * tx.quantity);
      continue;
    }
    if (tx.quantity > quantity + 1e-9) {
      oversells.push({ symbol: tx.symbol, date: tx.date, sold: tx.quantity, held: quantity });
    }
    held.set(tx.symbol, Math.max(0, quantity - tx.quantity));
  }
  return oversells;
}

/** Chỉ những lần bán vượt phát sinh do thêm `incoming` — bỏ qua các trường hợp đã có sẵn. */
export function findNewOversells(
  existing: PositionTx[],
  incoming: PositionTx[],
  portfolioId: string
): Oversell[] {
  const key = (o: Oversell) => `${o.symbol}|${o.date}|${o.sold}`;
  const before = new Set(findOversells(existing, portfolioId).map(key));
  return findOversells([...existing, ...incoming], portfolioId).filter(
    (o) => !before.has(key(o))
  );
}

/** Số cổ phiếu đang giữ tính tới hết ngày `day` (YYYY-MM-DD). */
export function heldQuantityAt(
  transactions: PositionTx[],
  portfolioId: string,
  symbol: string,
  day: string
): number {
  let quantity = 0;
  const trades = transactions
    .filter(
      (t) =>
        t.portfolioId === portfolioId && t.symbol === symbol && t.date.slice(0, 10) <= day
    )
    .sort(compareTransactionsChronologically);
  for (const tx of trades) {
    if (tx.type === "BUY") quantity += tx.quantity;
    else if (tx.type === "SELL") quantity = Math.max(0, quantity - tx.quantity);
    else if (tx.type === "SPLIT" && tx.quantity > 0) quantity *= tx.quantity;
  }
  return quantity;
}

export function isCashSymbol(symbol: string) {
  return symbol === "CASH";
}
