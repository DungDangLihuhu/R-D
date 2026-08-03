"use client";

import { useEffect, useState } from "react";
import type { ChartTimeframe, OhlcPoint } from "@/lib/chart-history";
import { formatChartMonthYear } from "@/lib/format";

function seedToOhlc(
  seed: { date: string; close: number }[],
  timeframe: ChartTimeframe
): OhlcPoint[] {
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
  const [points, setPoints] = useState<OhlcPoint[]>(() => {
    if (timeframe === "1d" && dailySeed?.length) return seedToOhlc(dailySeed, timeframe);
    return [];
  });
  const [loading, setLoading] = useState(() => !(timeframe === "1d" && dailySeed?.length));
  const [error, setError] = useState<string | null>(null);

  const seedKey =
    dailySeed?.length && timeframe === "1d"
      ? `${dailySeed.length}:${dailySeed[0]?.date}:${dailySeed[dailySeed.length - 1]?.date}`
      : "";

  useEffect(() => {
    let cancelled = false;
    const hasSeed = timeframe === "1d" && (dailySeed?.length ?? 0) > 0;

    if (!hasSeed) {
      setLoading(true);
      setError(null);
    }

    const controller = new AbortController();
    fetch(`/api/stock/${encodeURIComponent(symbol)}/history?timeframe=${timeframe}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          if (!hasSeed) {
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
        if (!hasSeed) {
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
  }, [symbol, timeframe, seedKey, dailySeed]);

  return { points, loading, error };
}
