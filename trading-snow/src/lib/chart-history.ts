import { encodeYahooSymbol, resolveYahooSymbolCandidates, toYahooSymbol } from "./symbol";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

/** All chart timeframes use daily (1D) candles; range controls the window. */
const CHART_INTERVAL = "1d";

export const CHART_TIMEFRAMES = ["1h", "4h", "1d", "1w", "1m", "all"] as const;
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

interface TimeframeSpec {
  range: string;
  /** Yahoo lacks some ranges (e.g. 2w) — trim after fetch. */
  trimDays?: number;
}

const TIMEFRAME_SPECS: Record<ChartTimeframe, TimeframeSpec> = {
  "1h": { range: "1mo", trimDays: 14 },
  "4h": { range: "2mo" },
  "1d": { range: "6mo" },
  "1w": { range: "2y" },
  "1m": { range: "5y" },
  all: { range: "max" },
};

export function isChartTimeframe(value: string): value is ChartTimeframe {
  return (CHART_TIMEFRAMES as readonly string[]).includes(value);
}

function formatChartLabel(date: Date, timeframe: ChartTimeframe): string {
  if (timeframe === "1h" || timeframe === "4h" || timeframe === "1d") {
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  }
  if (timeframe === "1w") {
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }
  if (timeframe === "1m" || timeframe === "all") {
    return date.toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
  }
  return date.toLocaleDateString("vi-VN", { month: "2-digit", year: "numeric" });
}

function trimToDays(points: OhlcPoint[], days: number): OhlcPoint[] {
  if (!points.length || days <= 0) return points;
  const last = new Date(points[points.length - 1].date).getTime();
  const cutoff = last - days * 24 * 60 * 60 * 1000;
  return points.filter((p) => new Date(p.date).getTime() >= cutoff);
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
  const spec = TIMEFRAME_SPECS[timeframe];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=${CHART_INTERVAL}&range=${spec.range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  let points = parseYahooOhlc(result, timeframe);
  if (spec.trimDays) {
    points = trimToDays(points, spec.trimDays);
  }
  return points;
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
