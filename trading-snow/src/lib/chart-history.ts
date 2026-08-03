import { encodeYahooSymbol, resolveYahooSymbolCandidates, toYahooSymbol } from "./symbol";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

/** All chart timeframes use daily (1D) candles; range controls the window. */
const CHART_INTERVAL = "1d";

export const CHART_TIMEFRAMES = ["1h", "4h", "1d", "1w", "1m", "1y", "5y", "all"] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];
export type ChartStyle = "line" | "candle";

export interface OhlcPoint {
  date: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TIMEFRAME_RANGES: Record<ChartTimeframe, string> = {
  "1h": "5d",
  "4h": "1mo",
  "1d": "3mo",
  "1w": "2y",
  "1m": "3mo",
  "1y": "1y",
  "5y": "5y",
  all: "max",
};

export function isChartTimeframe(value: string): value is ChartTimeframe {
  return (CHART_TIMEFRAMES as readonly string[]).includes(value);
}

function formatChartLabel(date: Date, timeframe: ChartTimeframe): string {
  if (timeframe === "1h" || timeframe === "4h" || timeframe === "1d" || timeframe === "1m") {
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  }
  if (timeframe === "1w") {
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }
  if (timeframe === "5y" || timeframe === "all" || timeframe === "1y") {
    return date.toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
  }
  return date.toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
}

function parseYahooOhlc(
  result: {
    timestamp?: number[];
    indicators?: {
      quote?: {
        open?: (number | null)[];
        high?: (number | null)[];
        low?: (number | null)[];
        close?: (number | null)[];
        volume?: (number | null)[];
      }[];
    };
  },
  timeframe: ChartTimeframe
): OhlcPoint[] {
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const points: OhlcPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      close <= 0 ||
      high <= 0 ||
      low <= 0
    ) {
      continue;
    }
    const date = new Date(timestamps[i] * 1000);
    const volume = volumes[i] ?? 0;
    points.push({
      date: date.toISOString(),
      label: formatChartLabel(date, timeframe),
      open,
      high,
      low,
      close,
      volume: volume > 0 ? volume : 0,
    });
  }
  return points;
}

async function fetchOhlcOne(
  yahooSymbol: string,
  timeframe: ChartTimeframe
): Promise<OhlcPoint[]> {
  const range = TIMEFRAME_RANGES[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=${CHART_INTERVAL}&range=${range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  return parseYahooOhlc(result, timeframe);
}

export async function fetchChartHistory(
  symbol: string,
  timeframe: ChartTimeframe
): Promise<OhlcPoint[]> {
  const upper = symbol.trim().toUpperCase();
  const candidates = [...new Set([...resolveYahooSymbolCandidates(upper), toYahooSymbol(upper)])];

  for (const yahoo of candidates) {
    const points = await fetchOhlcOne(yahoo, timeframe);
    if (points.length > 1) return points;
  }
  return [];
}

export function showPriceLevelsOnChart(_timeframe: ChartTimeframe): boolean {
  return true;
}
