import type {
  ClosedTrade,
  Holding,
  MarketQuote,
  PortfolioStats,
  Transaction,
} from "./types";
import {
  buildIrrCashFlows,
  computePortfolioIrr,
  computeTotalProfit,
} from "./portfolio-snowball";

interface PositionState {
  quantity: number;
  totalCost: number;
}

export function computePortfolioStats(
  transactions: Transaction[],
  portfolioId: string,
  marketPrices: Record<string, number> = {},
  marketQuotes: Record<string, MarketQuote> = {}
): PortfolioStats {
  const sorted = [...transactions]
    .filter((t) => t.portfolioId === portfolioId)
    .sort((a, b) => a.date.localeCompare(b.date));

  const positions = new Map<string, PositionState>();
  const closedTrades: ClosedTrade[] = [];
  const lastPrices = new Map<string, number>();

  let cashBalance = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let totalFees = 0;
  let realizedPnl = 0;

  const equityPoints: { date: string; equity: number }[] = [];
  const tradingEquityPoints: { date: string; equity: number }[] = [];
  const monthlyMap = new Map<string, number>();

  const addMonthlyPnl = (date: string, pnl: number) => {
    const month = date.slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + pnl);
  };

  const holdingsValueAtPrices = (useMarket: boolean) => {
    let value = 0;
    for (const [symbol, pos] of positions) {
      if (pos.quantity <= 0) continue;
      const price = useMarket
        ? marketPrices[symbol] ?? lastPrices.get(symbol) ?? pos.totalCost / pos.quantity
        : lastPrices.get(symbol) ?? pos.totalCost / pos.quantity;
      value += pos.quantity * price;
    }
    return value;
  };

  const snapshotEquity = (date: string, useMarket = false) => {
    equityPoints.push({
      date,
      equity: cashBalance + holdingsValueAtPrices(useMarket),
    });
    tradingEquityPoints.push({
      date,
      equity: holdingsValueAtPrices(useMarket) + realizedPnl,
    });
  };

  for (const tx of sorted) {
    const gross = tx.quantity * tx.price;
    totalFees += tx.fee;

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
        lastPrices.set(tx.symbol, tx.price);
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
        lastPrices.set(tx.symbol, tx.price);

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
    snapshotEquity(tx.date, false);
  }

  if (equityPoints.length > 0) {
    const lastIdx = equityPoints.length - 1;
    const marketHoldings = holdingsValueAtPrices(true);
    equityPoints[lastIdx] = {
      date: equityPoints[lastIdx].date,
      equity: cashBalance + marketHoldings,
    };
    tradingEquityPoints[lastIdx] = {
      date: tradingEquityPoints[lastIdx].date,
      equity: marketHoldings + realizedPnl,
    };
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

  const holdingsCost = holdings.reduce((s, h) => s + h.totalCost, 0);
  const portfolioValue = cashBalance + holdingsValue;
  const tradingValue = holdingsValue + realizedPnl;

  const now = new Date().toISOString();
  const lastPoint = equityPoints[equityPoints.length - 1];
  if (!lastPoint || Math.abs(lastPoint.equity - portfolioValue) > 0.01) {
    equityPoints.push({ date: now, equity: portfolioValue });
  } else {
    lastPoint.date = now;
    lastPoint.equity = portfolioValue;
  }

  const lastTrading = tradingEquityPoints[tradingEquityPoints.length - 1];
  if (!lastTrading || Math.abs(lastTrading.equity - tradingValue) > 0.01) {
    tradingEquityPoints.push({ date: now, equity: tradingValue });
  } else {
    lastTrading.date = now;
    lastTrading.equity = tradingValue;
  }

  const monthlyPnl = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }));

  const totalProfit = computeTotalProfit(
    portfolioValue,
    totalDeposits,
    totalWithdrawals
  );
  const totalProfitPercent =
    holdingsCost > 0 ? (totalProfit / holdingsCost) * 100 : 0;

  let dailyHoldingsProfit = 0;
  for (const h of holdings) {
    const quote = marketQuotes[h.symbol];
    if (quote) {
      dailyHoldingsProfit += h.quantity * quote.change;
    }
  }
  const prevHoldingsValue = holdingsValue - dailyHoldingsProfit;
  const dailyHoldingsProfitPercent =
    prevHoldingsValue > 0 ? (dailyHoldingsProfit / prevHoldingsValue) * 100 : 0;

  const profitExDivSales = unrealizedPnl;
  const profitExDivSalesPercent =
    holdingsCost > 0 ? (profitExDivSales / holdingsCost) * 100 : 0;

  const irrFlows = buildIrrCashFlows(sorted, tradingValue);
  const irr = computePortfolioIrr(irrFlows);

  return {
    totalDeposits,
    totalWithdrawals,
    totalDividends,
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl + totalDividends,
    portfolioValue,
    tradingValue,
    netCapital: totalDeposits - totalWithdrawals,
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
    tradingEquityCurve: tradingEquityPoints,
    holdingsValue,
    holdingsCost,
    totalFees,
    totalProfit,
    totalProfitPercent,
    dailyHoldingsProfit,
    dailyHoldingsProfitPercent,
    profitExDivSales,
    profitExDivSalesPercent,
    irr,
  };
}
