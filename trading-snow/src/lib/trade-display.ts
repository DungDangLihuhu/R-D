import type { Transaction } from "./types";

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
    .sort((a, b) => a.date.localeCompare(b.date));

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

export function isCashSymbol(symbol: string) {
  return symbol === "CASH";
}
