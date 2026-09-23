"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { usePriceHistory, type PriceHistoryStatus } from "@/hooks/usePriceHistory";
import { downsampleMonthly } from "@/lib/format";
import { visiblePortfolioTransactions } from "@/lib/hidden-symbols";
import { buildMarketProfitCurve } from "@/lib/price-history";

/**
 * Đường lợi nhuận ròng cho biểu đồ: định giá theo giá đóng cửa lịch sử khi tải được,
 * không thì rơi về đường tính theo giá khớp lệnh gần nhất trong `stats.profitCurve`.
 */
export function useProfitCurve(): {
  points: { date: string; value: number }[];
  status: PriceHistoryStatus;
} {
  const { state, usd, stats, activePortfolioId, hiddenSymbols } = useApp();

  // Lịch sử giá chọn kiểu giá bằng lệnh gốc (tiền niêm yết), đường lợi nhuận tính bằng USD.
  const nativeTransactions = useMemo(
    () => visiblePortfolioTransactions(state.transactions, activePortfolioId, hiddenSymbols),
    [state.transactions, activePortfolioId, hiddenSymbols]
  );
  const usdTransactions = useMemo(
    () => visiblePortfolioTransactions(usd.transactions, activePortfolioId, hiddenSymbols),
    [usd.transactions, activePortfolioId, hiddenSymbols]
  );

  const { series, status } = usePriceHistory(nativeTransactions);

  return useMemo(() => {
    const market = series
      ? buildMarketProfitCurve(usdTransactions, series, stats.totalProfit)
      : null;
    if (market) return { points: market, status };
    const fallback = downsampleMonthly(
      [...stats.profitCurve].sort((a, b) => a.date.localeCompare(b.date))
    );
    return { points: fallback, status: status === "ready" ? ("failed" as const) : status };
  }, [series, status, usdTransactions, stats.totalProfit, stats.profitCurve]);
}
