import { encodeYahooSymbol, resolveYahooSymbolCandidates, toYahooSymbol } from "./symbol";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

export const CHART_TIMEFRAMES = ["1h", "4h", "1d", "1w", "1m", "all"] as const;
export type ChartTimeframe = (typeof CHART_TIMEFRAMES)[number];

/** Phân tích cơ bản — không có 1H/4H */
export const FUNDAMENTAL_CHART_TIMEFRAMES = ["1d", "1w", "1m", "all"] as const satisfies readonly ChartTimeframe[];

/** Phân tích kĩ thuật — không có 1M */
export const TECHNICAL_CHART_TIMEFRAMES = ["1h", "4h", "1d", "1w", "all"] as const satisfies readonly ChartTimeframe[];
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
  /** Yahoo candle interval — 1H = 60m, 1W = 1wk, 1M = 1mo, etc. */
  interval: string;
  range: string;
  aggregate4h?: boolean;
}

const TIMEFRAME_SPECS: Record<ChartTimeframe, TimeframeSpec> = {
  "1h": { interval: "60m", range: "1mo" },
  "4h": { interval: "60m", range: "3mo", aggregate4h: true },
  "1d": { interval: "1d", range: "6mo" },
  "1w": { interval: "1wk", range: "2y" },
  "1m": { interval: "1mo", range: "5y" },
  all: { interval: "3mo", range: "max" },
};

export function isChartTimeframe(value: string): value is ChartTimeframe {
  return (CHART_TIMEFRAMES as readonly string[]).includes(value);
}

function formatChartLabel(date: Date, timeframe: ChartTimeframe): string {
  if (timeframe === "1h" || timeframe === "4h") {
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (timeframe === "1d") {
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

function aggregateTo4h(points: OhlcPoint[]): OhlcPoint[] {
  if (!points.length) return [];
  const bucketMs = 4 * 60 * 60 * 1000;
  const buckets = new Map<number, OhlcPoint[]>();

  for (const p of points) {
    const t = new Date(p.date).getTime();
    const key = Math.floor(t / bucketMs) * bucketMs;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, bars]) => {
      const date = new Date(key);
      return {
        date: date.toISOString(),
        label: formatChartLabel(date, "4h"),
        open: bars[0].open,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((sum, b) => sum + b.volume, 0),
      };
    });
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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=${spec.interval}&range=${spec.range}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  let points = parseYahooOhlc(result, timeframe);
  if (spec.aggregate4h) {
    points = aggregateTo4h(points);
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

export function showPriceLevelsOnChart(timeframe: ChartTimeframe): boolean {
  return timeframe !== "1h" && timeframe !== "4h";
}
