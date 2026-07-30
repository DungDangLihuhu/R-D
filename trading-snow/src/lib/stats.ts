import type {
  ClosedTrade,
  Holding,
  PortfolioStats,
  Transaction,
} from "./types";

interface PositionState {
  quantity: number;
  totalCost: number;
}

export function computePortfolioStats(
  transactions: Transaction[],
  portfolioId: string,
  marketPrices: Record<string, number> = {}
): PortfolioStats {
  const sorted = [...transactions]
    .filter((t) => t.portfolioId === portfolioId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const positions = new Map<string, PositionState>();
  const holdingsMap = new Map<string, Holding>();
  const closedTrades: ClosedTrade[] = [];

  let cashBalance = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let realizedPnl = 0;

  const equityPoints: { date: string; equity: number }[] = [];
  const monthlyMap = new Map<string, number>();

  const addMonthlyPnl = (date: string, pnl: number) => {
    const month = date.slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + pnl);
  };

  const snapshotEquity = (date: string) => {
    let holdingsValue = 0;
    for (const [symbol, pos] of positions) {
      if (pos.quantity <= 0) continue;
      const price = marketPrices[symbol] ?? pos.totalCost / pos.quantity;
      holdingsValue += pos.quantity * price;
    }
    equityPoints.push({ date, equity: cashBalance + holdingsValue });
  };

  for (const tx of sorted) {
    const gross = tx.quantity * tx.price;

    switch (tx.type) {
      case "DEPOSIT":
        cashBalance += gross;
        totalDeposits += gross;
        break;
      case "WITHDRAW":
        cashBalance -= gross;
        totalWithdrawals += gross;
        break;
      case "DIVIDEND":
        cashBalance += gross - tx.fee;
        totalDividends += gross - tx.fee;
        addMonthlyPnl(tx.date, gross - tx.fee);
        break;
      case "BUY": {
        const cost = gross + tx.fee;
        cashBalance -= cost;
        const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
        pos.quantity += tx.quantity;
        pos.totalCost += cost;
        positions.set(tx.symbol, pos);
        break;
      }
      case "SELL": {
        const pos = positions.get(tx.symbol) ?? { quantity: 0, totalCost: 0 };
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        const costBasis = avgCost * tx.quantity;
        const proceeds = gross - tx.fee;
        const pnl = proceeds - costBasis;
        realizedPnl += pnl;
        cashBalance += proceeds;
        addMonthlyPnl(tx.date, pnl);

        pos.quantity = Math.max(0, pos.quantity - tx.quantity);
        pos.totalCost = Math.max(0, pos.totalCost - costBasis);
        positions.set(tx.symbol, pos);

        closedTrades.push({
          symbol: tx.symbol,
          quantity: tx.quantity,
          costBasis,
          proceeds,
          pnl,
          pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
          date: tx.date,
        });
        break;
      }
    }
    snapshotEquity(tx.date);
  }

  let unrealizedPnl = 0;
  const holdings: Holding[] = [];

  for (const [symbol, pos] of positions) {
    if (pos.quantity <= 0.000001) continue;
    const avgCost = pos.totalCost / pos.quantity;
    const marketPrice = marketPrices[symbol];
    const marketValue = marketPrice ? pos.quantity * marketPrice : pos.totalCost;
    const unrealized = marketPrice ? marketValue - pos.totalCost : 0;
    unrealizedPnl += unrealized;

    holdings.push({
      symbol,
      assetType: "STOCK",
      quantity: pos.quantity,
      avgCost,
      totalCost: pos.totalCost,
      marketPrice,
    });
    holdingsMap.set(symbol, holdings[holdings.length - 1]);
  }

  holdings.sort((a, b) => b.totalCost - a.totalCost);

  const wins = closedTrades.filter((t) => t.pnl > 0);
  const losses = closedTrades.filter((t) => t.pnl < 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const totalTrades = closedTrades.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
  const avgWin =
    winCount > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / winCount : 0;
  const avgLoss =
    lossCount > 0
      ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / lossCount)
      : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor =
    grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const holdingsValue = holdings.reduce((s, h) => {
    const price = h.marketPrice ?? h.avgCost;
    return s + h.quantity * price;
  }, 0);

  const monthlyPnl = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }));

  return {
    totalDeposits,
    totalWithdrawals,
    totalDividends,
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    portfolioValue: cashBalance + holdingsValue,
    cashBalance,
    winCount,
    lossCount,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalTrades,
    holdings,
    closedTrades,
    monthlyPnl,
    equityCurve: equityPoints,
  };
}
