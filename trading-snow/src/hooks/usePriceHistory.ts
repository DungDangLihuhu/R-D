"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-cache";
import { currencyUnit, rateOnOrBefore, type FxLookup, type FxSeries } from "@/lib/fx";
import { pickCloseSeries, type CloseSeries } from "@/lib/price-history";
import type { Transaction } from "@/lib/types";
import type { CloseHistory } from "@/lib/yahoo";

/** /api/history nhận tối đa 20 mã mỗi lần. */
const BATCH_SIZE = 20;
const DAY_MS = 86_400_000;

export type PriceHistoryStatus = "idle" | "loading" | "ready" | "failed";

/**
 * Giá đóng cửa lịch sử (quy ra USD theo tỷ giá từng ngày) của mọi mã từng mua/bán trong
 * `transactions`, từ lệnh đầu tiên tới hôm nay, đã chọn đúng kiểu giá (gốc hay đã điều
 * chỉnh split) theo cách ghi lệnh. `transactions` là lệnh gốc theo tiền niêm yết.
 */
export function usePriceHistory(transactions: Transaction[]): {
  series: CloseSeries | null;
  status: PriceHistoryStatus;
  /** Giá gốc Yahoo kèm lịch sử split, chưa quy đổi — để đối chiếu với lệnh đã ghi. */
  raw: Record<string, CloseHistory> | null;
} {
  // Chuỗi thay vì mảng làm khóa: thêm một lệnh của mã cũ không bắt tải lại.
  const { symbolsCsv, from, currenciesCsv } = useMemo(() => {
    const trades = transactions.filter(
      (t) =>
        (t.type === "BUY" || t.type === "SELL" || t.type === "SPLIT") && t.symbol !== "CASH"
    );
    if (trades.length === 0) return { symbolsCsv: "", from: "", currenciesCsv: "" };
    const symbols = [...new Set(trades.map((t) => t.symbol.toUpperCase()))].sort();
    const bases = [
      ...new Set(
        trades.map((t) => currencyUnit(t.currency).base).filter((b) => b !== "USD")
      ),
    ].sort();
    const first = trades.reduce((min, t) => (t.date < min ? t.date : min), trades[0].date);
    // Lùi một tuần để có giá đóng cửa trước cả lệnh đầu tiên.
    const start = new Date(Date.parse(first.slice(0, 10)) - 7 * DAY_MS);
    return {
      symbolsCsv: symbols.join(","),
      from: start.toISOString().slice(0, 10),
      currenciesCsv: bases.join(","),
    };
  }, [transactions]);

  const requestKey = symbolsCsv ? `${from}|${symbolsCsv}|${currenciesCsv}` : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    history: Record<string, CloseHistory>;
    fx: Record<string, FxSeries>;
    fxFailed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!symbolsCsv) return;
    let cancelled = false;
    const symbols = symbolsCsv.split(",");
    const batches: string[][] = [];
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      batches.push(symbols.slice(i, i + BATCH_SIZE));
    }

    const history = Promise.all(
      batches.map((batch) =>
        fetchJson<{ series?: Record<string, CloseHistory> }>(
          `/api/history?symbols=${encodeURIComponent(batch.join(","))}&from=${from}`,
          { ttlMs: 30 * 60 * 1000 }
        )
          .then((data) => data.series ?? {})
          .catch(() => ({}) as Record<string, CloseHistory>)
      )
    );
    const fx = currenciesCsv
      ? fetchJson<FxLookup>(`/api/fx?currencies=${currenciesCsv}&from=${from}`, {
          ttlMs: 30 * 60 * 1000,
        })
          .then((data) => ({ rates: data.rates ?? {}, failed: false }))
          .catch(() => ({ rates: {} as Record<string, FxSeries>, failed: true }))
      : Promise.resolve({ rates: {} as Record<string, FxSeries>, failed: false });

    Promise.all([history, fx]).then(([parts, fxResult]) => {
      if (cancelled) return;
      setLoaded({
        key: `${from}|${symbolsCsv}|${currenciesCsv}`,
        history: Object.assign({}, ...parts),
        fx: fxResult.rates,
        fxFailed: fxResult.failed,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [symbolsCsv, from, currenciesCsv]);

  return useMemo(() => {
    if (!requestKey) return { series: null, status: "idle" as const, raw: null };
    if (!loaded || loaded.key !== requestKey) {
      return { series: null, status: "loading" as const, raw: null };
    }
    const raw = loaded.history;
    // Thiếu tỷ giá thì không vẽ lẫn EUR với USD — để biểu đồ rơi về đường tính sẵn.
    if (loaded.fxFailed) return { series: null, status: "failed" as const, raw };

    const series: CloseSeries = {};
    for (const symbol of symbolsCsv.split(",")) {
      const history = loaded.history[symbol];
      if (!history || history.points.length === 0) continue;
      const trades = transactions.filter((t) => t.symbol.toUpperCase() === symbol);
      // Chọn kiểu giá (gốc / đã điều chỉnh split) bằng giá lệnh gốc, rồi mới quy USD.
      const closes = pickCloseSeries(history, trades);
      const currency = trades.find((t) => t.currency)?.currency;
      const { base, factor } = currencyUnit(currency);
      if (base === "USD") {
        series[symbol] = factor === 1 ? closes : closes.map((p) => ({ ...p, close: p.close * factor }));
        continue;
      }
      const fxPoints = loaded.fx[base]?.points;
      if (!fxPoints || fxPoints.length === 0) continue;
      series[symbol] = closes.map((p) => ({
        date: p.date,
        close: p.close * (rateOnOrBefore(fxPoints, p.date) ?? 0) * factor,
      }));
    }
    return Object.keys(series).length > 0
      ? { series, status: "ready" as const, raw }
      : { series: null, status: "failed" as const, raw };
  }, [requestKey, loaded, symbolsCsv, transactions]);
}
