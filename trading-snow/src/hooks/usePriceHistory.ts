"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-cache";
import { pickCloseSeries, type CloseSeries } from "@/lib/price-history";
import type { Transaction } from "@/lib/types";
import type { CloseHistory } from "@/lib/yahoo";

/** /api/history nhận tối đa 20 mã mỗi lần. */
const BATCH_SIZE = 20;
const DAY_MS = 86_400_000;

export type PriceHistoryStatus = "idle" | "loading" | "ready" | "failed";

/**
 * Giá đóng cửa lịch sử của mọi mã từng mua/bán trong `transactions`, từ lệnh đầu tiên
 * tới hôm nay, đã chọn đúng kiểu giá (gốc hay đã điều chỉnh split) theo cách ghi lệnh.
 */
export function usePriceHistory(transactions: Transaction[]): {
  series: CloseSeries | null;
  status: PriceHistoryStatus;
} {
  // Chuỗi thay vì mảng làm khóa: thêm một lệnh của mã cũ không bắt tải lại.
  const { symbolsCsv, from } = useMemo(() => {
    const trades = transactions.filter(
      (t) =>
        (t.type === "BUY" || t.type === "SELL" || t.type === "SPLIT") && t.symbol !== "CASH"
    );
    if (trades.length === 0) return { symbolsCsv: "", from: "" };
    const symbols = [...new Set(trades.map((t) => t.symbol.toUpperCase()))].sort();
    const first = trades.reduce((min, t) => (t.date < min ? t.date : min), trades[0].date);
    // Lùi một tuần để có giá đóng cửa trước cả lệnh đầu tiên.
    const start = new Date(Date.parse(first.slice(0, 10)) - 7 * DAY_MS);
    return { symbolsCsv: symbols.join(","), from: start.toISOString().slice(0, 10) };
  }, [transactions]);

  const requestKey = symbolsCsv ? `${from}|${symbolsCsv}` : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    history: Record<string, CloseHistory>;
  } | null>(null);

  useEffect(() => {
    if (!symbolsCsv) return;
    let cancelled = false;
    const symbols = symbolsCsv.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      batches.push(symbols.slice(i, i + BATCH_SIZE));
    }

    Promise.all(
      batches.map((batch) =>
        fetchJson<{ series?: Record<string, CloseHistory> }>(
          `/api/history?symbols=${encodeURIComponent(batch.join(","))}&from=${from}`,
          { ttlMs: 30 * 60 * 1000 }
        )
          .then((data) => data.series ?? {})
          .catch(() => ({}) as Record<string, CloseHistory>)
      )
    ).then((parts) => {
      if (!cancelled) {
        setLoaded({ key: `${from}|${symbolsCsv}`, history: Object.assign({}, ...parts) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [symbolsCsv, from]);

  return useMemo(() => {
    if (!requestKey) return { series: null, status: "idle" as const };
    if (!loaded || loaded.key !== requestKey) return { series: null, status: "loading" as const };

    const series: CloseSeries = {};
    for (const symbol of symbolsCsv.split(",")) {
      const history = loaded.history[symbol];
      if (!history || history.points.length === 0) continue;
      series[symbol] = pickCloseSeries(
        history,
        transactions.filter((t) => t.symbol.toUpperCase() === symbol)
      );
    }
    return Object.keys(series).length > 0
      ? { series, status: "ready" as const }
      : { series: null, status: "failed" as const };
  }, [requestKey, loaded, symbolsCsv, transactions]);
}
