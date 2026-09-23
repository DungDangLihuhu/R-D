"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { usePriceHistory, type PriceHistoryStatus } from "@/hooks/usePriceHistory";
import { downsampleMonthly } from "@/lib/format";
import { filterHiddenTransactions } from "@/lib/hidden-symbols";
import { buildMarketProfitCurve } from "@/lib/price-history";

/**
 * Đường lợi nhuận ròng cho biểu đồ: định giá theo giá đóng cửa lịch sử khi tải được,
 * không thì rơi về đường tính theo giá khớp lệnh gần nhất trong `stats.profitCurve`.
 */
export function useProfitCurve(): {
  points: { date: string; value: number }[];
  status: PriceHistoryStatus;
} {
  const { state, stats, activePortfolioId, hiddenSymbols } = useApp();

  const transactions = useMemo(
    () =>
      filterHiddenTransactions(state.transactions, activePortfolioId, hiddenSymbols).filter(
        (t) => t.portfolioId === activePortfolioId
      ),
    [state.transactions, activePortfolioId, hiddenSymbols]
  );

  const { series, status } = usePriceHistory(transactions);

  return useMemo(() => {
    const market = series ? buildMarketProfitCurve(transactions, series, stats.totalProfit) : null;
    if (market) return { points: market, status };
    const fallback = downsampleMonthly(
      [...stats.profitCurve].sort((a, b) => a.date.localeCompare(b.date))
    );
    return { points: fallback, status: status === "ready" ? ("failed" as const) : status };
  }, [series, status, transactions, stats.totalProfit, stats.profitCurve]);
}
