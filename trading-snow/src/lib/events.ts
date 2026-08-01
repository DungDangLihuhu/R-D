import { getFinnhubApiKey } from "./quote-config";
import type { CalendarEvent } from "./types";
import { fetchDividends, type DividendEvent } from "./yahoo";

const MACRO_KEYWORDS = [
  "cpi",
  "ppi",
  "pce",
  "gdp",
  "fomc",
  "fed funds",
  "federal funds",
  "jobless claims",
  "non-farm",
  "nonfarm",
  "nfp",
  "unemployment rate",
  "interest rate decision",
];

function finnhubKey(): string | undefined {
  return getFinnhubApiKey();
}

function symbolCandidates(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  const bare = upper.includes(".") ? upper.split(".")[0] : upper;
  return [...new Set([upper, bare])];
}

function toIsoDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString();
}

/** Project next dividend dates from Yahoo history (quarterly-ish). */
export function projectUpcomingDividends(
  history: DividendEvent[]
): DividendEvent[] {
  if (history.length < 2) return [];
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(
      new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()
    );
  }
  const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (!Number.isFinite(avgMs) || avgMs <= 0) return [];

  const projected: DividendEvent[] = [];
  const now = Date.now();
  const horizon = now + 400 * 24 * 3600 * 1000;
  let next = new Date(last.date).getTime() + avgMs;

  while (next < horizon && projected.length < 3) {
    if (next > now) {
      projected.push({
        symbol: last.symbol,
        date: new Date(next).toISOString(),
        amount: last.amount,
      });
    }
    next += avgMs;
  }
  return projected;
}

async function fetchEarningsForSymbol(
  symbol: string,
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const key = finnhubKey();
  if (!key) return [];

  const events: CalendarEvent[] = [];
  const now = new Date().toISOString();

  for (const sym of symbolCandidates(symbol)) {
    const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      earningsCalendar?: {
        symbol: string;
        date: string;
        hour?: string;
        quarter?: number;
        year?: number;
        epsEstimate?: number | null;
        epsActual?: number | null;
      }[];
    };

    for (const e of data.earningsCalendar ?? []) {
      if (e.date < from.slice(0, 10) || e.date > to.slice(0, 10)) continue;
      const isFuture = e.date >= now.slice(0, 10);
      const hourLabel =
        e.hour === "bmo" ? "trước mở cửa" : e.hour === "amc" ? "sau đóng cửa" : "";
      events.push({
        id: `er-${e.symbol}-${e.date}-Q${e.quarter ?? 0}`,
        date: `${e.date}T12:00:00.000Z`,
        title: `Báo cáo Q${e.quarter ?? "?"} ${e.year ?? ""}`.trim(),
        category: "earnings",
        symbol: symbol.toUpperCase(),
        subtitle: [
          hourLabel,
          e.epsEstimate != null ? `EPS dự báo ${e.epsEstimate.toFixed(2)}` : null,
          e.epsActual != null ? `EPS thực ${e.epsActual.toFixed(2)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        impact: isFuture ? "high" : "medium",
      });
    }
    if (events.length > 0) break;
  }

  return events;
}

async function fetchNewsForSymbol(symbol: string): Promise<CalendarEvent[]> {
  const key = finnhubKey();
  if (!key) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 14);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  for (const sym of symbolCandidates(symbol)) {
    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${fromStr}&to=${toStr}&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) continue;
    const items = (await res.json()) as {
      datetime: number;
      headline: string;
      summary?: string;
      url?: string;
      source?: string;
    }[];
    if (!Array.isArray(items) || items.length === 0) continue;

    return items.slice(0, 5).map((n, i) => ({
      id: `news-${symbol}-${n.datetime}-${i}`,
      date: new Date(n.datetime * 1000).toISOString(),
      title: n.headline,
      category: "news" as const,
      symbol: symbol.toUpperCase(),
      subtitle: n.source,
      url: n.url,
      impact: "medium" as const,
    }));
  }
  return [];
}

interface FfEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

async function fetchForexFactoryWeek(url: string): Promise<FfEvent[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as FfEvent[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchMacroEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const feeds = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];
  const raw: FfEvent[] = [];
  for (const feed of feeds) {
    raw.push(...(await fetchForexFactoryWeek(feed)));
  }

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();

  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  for (const e of raw) {
    if (e.country !== "USD") continue;
    if (e.impact !== "High") continue;
    const titleLower = e.title.toLowerCase();
    if (!MACRO_KEYWORDS.some((k) => titleLower.includes(k))) continue;

    const dt = new Date(e.date);
    if (dt.getTime() < fromMs || dt.getTime() > toMs) continue;

    const id = `macro-${e.date}-${e.title}`;
    if (seen.has(id)) continue;
    seen.add(id);

    events.push({
      id,
      date: dt.toISOString(),
      title: e.title,
      category: "macro",
      subtitle: [e.forecast ? `Dự báo ${e.forecast}` : null, e.previous ? `Trước ${e.previous}` : null]
        .filter(Boolean)
        .join(" · "),
      impact: "high",
    });
  }

  return events;
}

async function fetchUsMarketHolidays(from: string, to: string): Promise<CalendarEvent[]> {
  const key = finnhubKey();
  if (!key) return [];

  const res = await fetch(
    `https://finnhub.io/api/v1/stock/market-holiday?exchange=US&token=${key}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    data?: { eventName: string; atDate: string; tradingHour?: string }[];
  };

  const fromD = from.slice(0, 10);
  const toD = to.slice(0, 10);

  return (data.data ?? [])
    .filter((h) => h.atDate >= fromD && h.atDate <= toD)
    .map((h) => ({
      id: `holiday-${h.atDate}-${h.eventName}`,
      date: `${h.atDate}T13:00:00.000Z`,
      title: h.eventName,
      category: "holiday" as const,
      subtitle: h.tradingHour
        ? `Giờ giao dịch: ${h.tradingHour}`
        : "Đóng cửa toàn phiên",
      impact: "high" as const,
      symbol: "US",
    }));
}

export async function fetchDividendEvents(
  symbols: string[],
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const events: CalendarEvent[] = [];

  for (const symbol of symbols.slice(0, 40)) {
    const history = await fetchDividends(symbol);
    const all = [
      ...history,
      ...projectUpcomingDividends(history),
    ];

    for (const d of all) {
      const t = new Date(d.date).getTime();
      if (t < fromMs || t > toMs) continue;
      const isProjected = !history.some(
        (h) => h.date.slice(0, 10) === d.date.slice(0, 10)
      );
      events.push({
        id: `div-${d.symbol}-${d.date.slice(0, 10)}`,
        date: toIsoDate(d.date),
        title: isProjected ? "Cổ tức dự kiến" : "Cổ tức",
        category: "dividend",
        symbol: d.symbol,
        amount: d.amount,
        subtitle: `$${d.amount.toFixed(4)}/cp${isProjected ? " · ước tính từ lịch sử" : ""}`,
        impact: isProjected ? "medium" : "low",
      });
    }
  }

  return events;
}

export async function fetchPortfolioEvents(
  symbols: string[],
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter((s) => s !== "CASH"))];

  const [dividends, earnings, news, macro, holidays] = await Promise.all([
    fetchDividendEvents(unique, from, to),
    Promise.all(unique.slice(0, 30).map((s) => fetchEarningsForSymbol(s, from.slice(0, 10), to.slice(0, 10)))).then(
      (r) => r.flat()
    ),
    Promise.all(unique.slice(0, 15).map((s) => fetchNewsForSymbol(s))).then((r) => r.flat()),
    fetchMacroEvents(from, to),
    fetchUsMarketHolidays(from, to),
  ]);

  const erIds = new Set<string>();
  const dedupedEarnings = earnings.filter((e) => {
    if (erIds.has(e.id)) return false;
    erIds.add(e.id);
    return true;
  });

  return [...dividends, ...dedupedEarnings, ...news, ...macro, ...holidays].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}
