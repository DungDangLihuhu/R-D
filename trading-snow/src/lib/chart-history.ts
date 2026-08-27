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

/** Visible candles on every chart timeframe except All. */
export const CHART_BAR_LIMIT = 150;

const TIMEFRAME_SPECS: Record<ChartTimeframe, TimeframeSpec> = {
  "1h": { interval: "60m", range: "3mo" },
  "4h": { interval: "60m", range: "6mo", aggregate4h: true },
  "1d": { interval: "1d", range: "1y" },
  "1w": { interval: "1wk", range: "5y" },
  "1m": { interval: "1mo", range: "max" },
  all: { interval: "3mo", range: "max" },
};

export function limitChartBars(
  points: OhlcPoint[],
  timeframe: ChartTimeframe
): OhlcPoint[] {
  if (timeframe === "all" || points.length <= CHART_BAR_LIMIT) return points;
  return points.slice(-CHART_BAR_LIMIT);
}

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

function localDateKey(date: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(date));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return date.slice(0, 10);
  }
}

export interface RegularSessionHours {
  startMinutes: number;
  endMinutes: number;
}

const US_EQUITY_TIMEZONES = new Set([
  "America/New_York",
  "America/Toronto",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Kentucky/Louisville",
]);

function localMinutes(date: string, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(date));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    const fallback = new Date(date);
    return fallback.getUTCHours() * 60 + fallback.getUTCMinutes();
  }
}

export function defaultRegularSessionHours(
  timeZone: string
): RegularSessionHours | undefined {
  if (US_EQUITY_TIMEZONES.has(timeZone)) {
    return { startMinutes: 9 * 60 + 30, endMinutes: 16 * 60 };
  }
  return undefined;
}

export function sessionHoursFromYahooMeta(
  meta:
    | {
        currentTradingPeriod?: {
          regular?: { start?: number; end?: number };
        };
      }
    | undefined,
  timeZone: string
): RegularSessionHours | undefined {
  const regular = meta?.currentTradingPeriod?.regular;
  if (regular?.start && regular?.end) {
    const startMinutes = localMinutes(
      new Date(regular.start * 1000).toISOString(),
      timeZone
    );
    const endMinutes = localMinutes(
      new Date(regular.end * 1000).toISOString(),
      timeZone
    );
    if (endMinutes > startMinutes) {
      return { startMinutes, endMinutes };
    }
  }
  return defaultRegularSessionHours(timeZone);
}

function inRegularHours(
  date: string,
  timeZone: string,
  hours: RegularSessionHours | undefined
): boolean {
  if (!hours) return true;
  const minutes = localMinutes(date, timeZone);
  return minutes >= hours.startMinutes && minutes < hours.endMinutes;
}

function medianCount(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function modalMinute(points: OhlcPoint[]): number {
  const counts = new Map<number, number>();
  for (const point of points.slice(-30, -1)) {
    const date = new Date(point.date);
    const key = date.getUTCMinutes();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/**
 * Yahoo sometimes appends a quote snapshot after the active OHLC bucket
 * (e.g. a Thursday quote after the current weekly candle). It is not a real
 * candle and otherwise creates false pivots, volume dry-ups and climaxes.
 */
export function stripTrailingQuoteSnapshot(
  points: OhlcPoint[],
  timeframe: ChartTimeframe,
  timeZone = "America/New_York"
): OhlcPoint[] {
  if (points.length < 3) return points;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const lastDate = new Date(last.date);
  const prevDate = new Date(prev.date);
  const gapMs = lastDate.getTime() - prevDate.getTime();
  const irregularMinute =
    lastDate.getUTCMinutes() !== modalMinute(points) ||
    lastDate.getUTCSeconds() !== 0;
  const lastLocalDate = localDateKey(last.date, timeZone);
  const prevLocalDate = localDateKey(prev.date, timeZone);
  const overlapsBucket =
    (timeframe === "1h" && gapMs < 45 * 60 * 1000) ||
    (timeframe === "1d" && lastLocalDate === prevLocalDate) ||
    (timeframe === "1w" && gapMs < 5 * 24 * 60 * 60 * 1000) ||
    ((timeframe === "1m" || timeframe === "all") &&
      lastLocalDate.slice(0, 7) === prevLocalDate.slice(0, 7));

  return irregularMinute || overlapsBucket
    ? stripTrailingQuoteSnapshot(points.slice(0, -1), timeframe, timeZone)
    : points;
}

/**
 * Build 4H candles from regular exchange hours, not UTC wall-clock buckets.
 * US cash sessions become one 4H bar from the open plus the remaining RTH
 * bar. Premarket/after-hours hours are ignored, and a still-forming last
 * group is dropped so it cannot repaint as a fake 4H candle.
 */
export function aggregateTo4h(
  points: OhlcPoint[],
  timeZone = "America/New_York",
  sessionHours: RegularSessionHours | undefined = defaultRegularSessionHours(
    timeZone
  )
): OhlcPoint[] {
  const filtered = points.filter((point) =>
    inRegularHours(point.date, timeZone, sessionHours)
  );
  if (!filtered.length) return [];
  const sessions = new Map<string, OhlcPoint[]>();

  for (const p of filtered) {
    const key = localDateKey(p.date, timeZone);
    const arr = sessions.get(key) ?? [];
    arr.push(p);
    sessions.set(key, arr);
  }

  const ordered = [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b));
  const typical = medianCount(
    ordered.slice(0, -1).map(([, bars]) => bars.length).filter((count) => count >= 4)
  );
  const lastSessionLength = ordered[ordered.length - 1]?.[1].length ?? 0;
  const lastSessionIncomplete = typical > 0 && lastSessionLength < typical;

  const result: OhlcPoint[] = [];
  ordered.forEach(([, sessionBars], sessionIndex) => {
    const sorted = [...sessionBars].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const dropIncompleteRemainder =
      sessionIndex === ordered.length - 1 && lastSessionIncomplete;
    for (let start = 0; start < sorted.length; start += 4) {
      const bars = sorted.slice(start, start + 4);
      if (!bars.length) continue;
      if (dropIncompleteRemainder && bars.length < 4) continue;
      const date = new Date(bars[0].date);
      result.push({
        date: date.toISOString(),
        label: formatChartLabel(date, "4h"),
        open: bars[0].open,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((sum, b) => sum + b.volume, 0),
      });
    }
  });
  return result;
}

function parseYahooOhlc(
  result: {
    meta?: {
      exchangeTimezoneName?: string;
    };
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

  const sourceTimeframe = spec.aggregate4h ? "1h" : timeframe;
  const timeZone = result.meta?.exchangeTimezoneName ?? "America/New_York";
  let points = stripTrailingQuoteSnapshot(
    parseYahooOhlc(result, sourceTimeframe),
    sourceTimeframe,
    timeZone
  );
  if (spec.aggregate4h) {
    points = aggregateTo4h(
      points,
      timeZone,
      sessionHoursFromYahooMeta(result.meta, timeZone)
    );
  }
  return limitChartBars(points, timeframe);
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
