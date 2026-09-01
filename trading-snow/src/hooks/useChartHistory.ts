"use client";

import { useEffect, useState } from "react";
import type { ChartTimeframe, OhlcPoint } from "@/lib/chart-history";
import { formatChartMonthYear } from "@/lib/format";

function seedToOhlc(seed: { date: string; close: number }[]): OhlcPoint[] {
  return seed.map((p) => ({
    date: p.date.length > 10 ? p.date : `${p.date}T00:00:00.000Z`,
    label: formatChartMonthYear(p.date),
    open: p.close,
    high: p.close,
    low: p.close,
    close: p.close,
    volume: 0,
  }));
}

export function useChartHistory(
  symbol: string,
  timeframe: ChartTimeframe,
  dailySeed?: { date: string; close: number }[]
) {
  const hasSeed = timeframe === "1d" && (dailySeed?.length ?? 0) > 0;
  const seedKey = hasSeed
    ? `${dailySeed!.length}:${dailySeed![0]?.date}:${dailySeed![dailySeed!.length - 1]?.date}`
    : "";

  const [points, setPoints] = useState<OhlcPoint[]>(() =>
    hasSeed ? seedToOhlc(dailySeed!) : []
  );
  const [loading, setLoading] = useState(!hasSeed);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(`${symbol}|${timeframe}|${seedKey}`);

  // `dailySeed` là mảng mới mỗi render — chỉ fetch lại khi nội dung seed thật sự đổi.
  const nextRequest = `${symbol}|${timeframe}|${seedKey}`;
  if (request !== nextRequest) {
    setRequest(nextRequest);
    if (!hasSeed) {
      setLoading(true);
      setError(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const seeded = seedKey !== "";

    fetch(`/api/stock/${encodeURIComponent(symbol)}/history?timeframe=${timeframe}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          if (!seeded) {
            setError(json.error);
            setPoints([]);
          }
          return;
        }
        setPoints(json.points ?? []);
        setError(null);
      })
      .catch((e) => {
        if (cancelled || e.name === "AbortError") return;
        if (!seeded) {
          setError("Không tải được biểu đồ");
          setPoints([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, timeframe, seedKey]);

  return { points, loading, error };
}
