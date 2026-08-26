import {
  encodeYahooSymbol,
  resolveYahooSymbolCandidates,
  toYahooSymbol,
} from "./symbol";

import type { MarketSession } from "./types";

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

export interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  yahooSymbol?: string;
  exchangeName?: string;
  shortName?: string;
  logo?: string;
  source?: "yahoo" | "finnhub" | "yahoo-search" | "twelve-data";
  marketSession?: MarketSession;
}

export interface DividendEvent {
  symbol: string;
  date: string;
  amount: number;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  quoteType?: string;
}

export interface HistoryPoint {
  date: string;
  close: number;
}

export interface YahooInsiderTransaction {
  name: string;
  date: string;
  relation?: string;
  shares: number;
  value?: number;
  transactionText?: string;
}

export interface YahooInsiderData {
  transactions: YahooInsiderTransaction[];
  rosterByName: Record<string, string>;
}

let yahooSessionCache: { cookie: string; crumb: string; at: number } | null = null;

async function getYahooSession(): Promise<{ cookie: string; crumb: string } | null> {
  if (yahooSessionCache && Date.now() - yahooSessionCache.at < 3_600_000) {
    return { cookie: yahooSessionCache.cookie, crumb: yahooSessionCache.crumb };
  }

  const boot = await fetch("https://fc.yahoo.com", { headers: YAHOO_HEADERS });
  const cookie =
    typeof boot.headers.getSetCookie === "function"
      ? boot.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
      : boot.headers.get("set-cookie") ?? "";
  if (!cookie) return null;

  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...YAHOO_HEADERS, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("Invalid")) return null;

  yahooSessionCache = { cookie, crumb, at: Date.now() };
  return { cookie, crumb };
}

function yahooPersonKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

function parseYahooRawNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in v) {
    const raw = (v as { raw?: number }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return undefined;
}

function parseYahooRawDate(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v * 1000).toISOString().slice(0, 10);
  }
  if (v && typeof v === "object" && "raw" in v) {
    const raw = (v as { raw?: number }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return new Date(raw * 1000).toISOString().slice(0, 10);
    }
  }
  return undefined;
}

export async function fetchYahooInsiderData(symbol: string): Promise<YahooInsiderData | null> {
  const session = await getYahooSession();
  if (!session) return null;

  for (const candidate of resolveYahooSymbolCandidates(symbol)) {
    const yahoo = toYahooSymbol(candidate);
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeYahooSymbol(yahoo)}?modules=insiderTransactions,insiderHolders&crumb=${encodeURIComponent(session.crumb)}`;
    const res = await fetch(url, {
      headers: { ...YAHOO_HEADERS, Cookie: session.cookie },
      next: { revalidate: 3600 },
    });
    if (!res.ok) continue;

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) continue;

    const rosterByName: Record<string, string> = {};
    const holders = result?.insiderHolders?.holders ?? [];
    for (const h of holders) {
      const name = typeof h.name === "string" ? h.name : "";
      const relation = typeof h.relation === "string" ? h.relation.trim() : "";
      if (name && relation) rosterByName[yahooPersonKey(name)] = relation;
    }

    const transactions: YahooInsiderTransaction[] = [];
    const rawTx = result?.insiderTransactions?.transactions ?? [];
    for (const t of rawTx) {
      const name = typeof t.filerName === "string" ? t.filerName : "";
      const date = parseYahooRawDate(t.startDate);
      const shares = parseYahooRawNumber(t.shares) ?? 0;
      if (!name || !date || shares === 0) continue;
      const relation =
        typeof t.filerRelation === "string" ? t.filerRelation.trim() : undefined;
      if (relation) rosterByName[yahooPersonKey(name)] = relation;
      transactions.push({
        name,
        date,
        relation,
        shares,
        value: parseYahooRawNumber(t.value),
        transactionText:
          typeof t.transactionText === "string" ? t.transactionText : undefined,
      });
    }

    if (!transactions.length && !Object.keys(rosterByName).length) continue;
    return { transactions, rosterByName };
  }

  return null;
}

export function yahooInsiderShareChange(shares: number, transactionText?: string): number {
  const text = (transactionText ?? "").toLowerCase();
  if (text.includes("sale") || text.includes("sell")) return -Math.abs(shares);
  if (
    text.includes("purchase") ||
    text.includes("buy") ||
    text.includes("acquisition") ||
    text.includes("grant")
  ) {
    return Math.abs(shares);
  }
  return shares;
}

export async function fetchPriceHistory(
  symbol: string,
  from: Date,
  to: Date
): Promise<HistoryPoint[]> {
  const yahoo = toYahooSymbol(symbol);
  const period1 = Math.floor(from.getTime() / 1000);
  const period2 = Math.floor(to.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahoo)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];

  const points: HistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || close <= 0) continue;
    points.push({
      date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
      close,
    });
  }
  return points;
}

interface YahooChartMeta {
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  preMarketTime?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  postMarketTime?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  symbol?: string;
  fullExchangeName?: string;
  exchangeName?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
}

interface YahooV7Quote {
  symbol?: string;
  marketState?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketPreviousClose?: number;
  preMarketPrice?: number;
  preMarketChange?: number;
  preMarketChangePercent?: number;
  postMarketPrice?: number;
  postMarketChange?: number;
  postMarketChangePercent?: number;
  fullExchangeName?: string;
  exchange?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
}

function v7QuoteToMeta(q: YahooV7Quote): YahooChartMeta {
  return {
    marketState: q.marketState,
    regularMarketPrice: q.regularMarketPrice,
    regularMarketTime: q.regularMarketTime,
    preMarketPrice: q.preMarketPrice,
    preMarketChange: q.preMarketChange,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChange: q.postMarketChange,
    postMarketChangePercent: q.postMarketChangePercent,
    chartPreviousClose: q.regularMarketPreviousClose,
    previousClose: q.regularMarketPreviousClose,
    symbol: q.symbol,
    fullExchangeName: q.fullExchangeName,
    exchangeName: q.exchange,
    shortName: q.shortName ?? q.longName,
    currency: q.currency,
  };
}

function quoteResultFromMeta(
  meta: YahooChartMeta,
  requestedSymbol: string,
  source: QuoteResult["source"] = "yahoo"
): QuoteResult | null {
  const resolved = resolveExtendedQuote(meta);
  if (!resolved) return null;

  return {
    symbol: requestedSymbol,
    yahooSymbol: meta.symbol,
    exchangeName: meta.fullExchangeName ?? meta.exchangeName,
    shortName: meta.shortName ?? meta.longName,
    price: resolved.price,
    change: resolved.change,
    changePercent: resolved.changePercent,
    currency: meta.currency ?? "USD",
    marketSession: resolved.marketSession,
    source,
  };
}

/** Yahoo v7 quote API (authenticated) — includes reliable pre/post market data. */
async function fetchYahooQuotesV7(
  requestedSymbols: string[],
  yahooSymbols: string[]
): Promise<Map<string, QuoteResult>> {
  const out = new Map<string, QuoteResult>();
  if (yahooSymbols.length === 0) return out;

  const session = await getYahooSession();
  if (!session) return out;

  const yahooToRequested = new Map<string, string>();
  for (let i = 0; i < yahooSymbols.length; i++) {
    const yahoo = yahooSymbols[i].toUpperCase();
    const requested = requestedSymbols[i]?.toUpperCase() ?? yahoo;
    if (!yahooToRequested.has(yahoo)) yahooToRequested.set(yahoo, requested);
  }

  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  for (const host of hosts) {
    const url = `https://${host}/v7/finance/quote?symbols=${encodeURIComponent(
      [...yahooToRequested.keys()].join(",")
    )}&crumb=${encodeURIComponent(session.crumb)}`;
    const res = await fetch(url, {
      headers: { ...YAHOO_HEADERS, Cookie: session.cookie },
      cache: "no-store",
    });
    if (!res.ok) continue;

    const json = (await res.json()) as { quoteResponse?: { result?: YahooV7Quote[] } };
    const rows = json.quoteResponse?.result ?? [];
    for (const row of rows) {
      const yahooSym = row.symbol?.toUpperCase();
      if (!yahooSym) continue;
      const requested = yahooToRequested.get(yahooSym) ?? yahooSym;
      const quote = quoteResultFromMeta(v7QuoteToMeta(row), requested, "yahoo");
      if (quote) out.set(requested, quote);
    }
    if (out.size > 0) return out;
  }

  return out;
}

/** Pick live price + session from Yahoo chart meta (pre / regular / post). */
export function resolveExtendedQuote(meta: YahooChartMeta): {
  price: number;
  change: number;
  changePercent: number;
  marketSession: MarketSession;
} | null {
  const regular = meta.regularMarketPrice;
  if (!regular || regular <= 0) return null;

  const prevClose =
    meta.chartPreviousClose ?? meta.previousClose ?? regular;
  const state = String(meta.marketState ?? "").toUpperCase();
  const pre = meta.preMarketPrice;
  const post = meta.postMarketPrice;
  const preTime = meta.preMarketTime;
  const postTime = meta.postMarketTime;
  const regularTime = meta.regularMarketTime;

  const fromPrevClose = (price: number) => {
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return { price, change, changePercent };
  };

  if ((state === "PRE" || state === "PREPRE") && pre && pre > 0) {
    const change = meta.preMarketChange ?? pre - prevClose;
    const changePercent =
      meta.preMarketChangePercent ??
      (prevClose > 0 ? (change / prevClose) * 100 : 0);
    return { price: pre, change, changePercent, marketSession: "pre" };
  }

  if ((state === "POST" || state === "POSTPOST") && post && post > 0) {
    const base = regular;
    const change = meta.postMarketChange ?? post - base;
    const changePercent =
      meta.postMarketChangePercent ??
      (base > 0 ? (change / base) * 100 : 0);
    return { price: post, change, changePercent, marketSession: "post" };
  }

  if (state === "REGULAR") {
    return { ...fromPrevClose(regular), marketSession: "regular" };
  }

  // Chart API often omits marketState — prefer pre when live and no post quote
  if (pre && pre > 0 && pre !== regular && !(post && post > 0)) {
    const change = meta.preMarketChange ?? pre - prevClose;
    const changePercent =
      meta.preMarketChangePercent ??
      (prevClose > 0 ? (change / prevClose) * 100 : 0);
    return { price: pre, change, changePercent, marketSession: "pre" };
  }

  // CLOSED — use latest extended quote if still from current session day
  if (post && post > 0 && postTime && regularTime && postTime >= regularTime) {
    const base = regular;
    const change = meta.postMarketChange ?? post - base;
    const changePercent =
      meta.postMarketChangePercent ??
      (base > 0 ? (change / base) * 100 : 0);
    return { price: post, change, changePercent, marketSession: "post" };
  }
  if (pre && pre > 0 && preTime && (!regularTime || preTime > regularTime)) {
    const change = meta.preMarketChange ?? pre - prevClose;
    const changePercent =
      meta.preMarketChangePercent ??
      (prevClose > 0 ? (change / prevClose) * 100 : 0);
    return { price: pre, change, changePercent, marketSession: "pre" };
  }

  return { ...fromPrevClose(regular), marketSession: "closed" };
}

async function fetchQuoteOne(
  yahooSymbol: string,
  requestedSymbol: string,
  source: QuoteResult["source"] = "yahoo"
): Promise<QuoteResult | null> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=1d&range=1d&includePrePost=true`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
    if (!res.ok) continue;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta as YahooChartMeta | undefined;
    if (!meta) continue;

    const quote = quoteResultFromMeta(
      { ...meta, symbol: meta.symbol ?? yahooSymbol },
      requestedSymbol,
      source
    );
    if (quote) return quote;
  }

  return null;
}

async function searchYahooSymbol(query: string): Promise<string | null> {
  const results = await searchYahooSymbols(query, 8);
  return results[0]?.symbol ?? null;
}

export async function searchYahooSymbols(
  query: string,
  limit = 8
): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const json = await res.json();
  const quotes: {
    symbol?: string;
    quoteType?: string;
    shortname?: string;
    longname?: string;
    exchDisp?: string;
    exchange?: string;
  }[] = json?.quotes ?? [];

  const allowed = new Set(["EQUITY", "ETF"]);
  const seen = new Set<string>();

  return quotes
    .filter((item) => {
      if (!item.symbol) return false;
      if (item.quoteType && !allowed.has(item.quoteType)) return false;
      const sym = item.symbol.toUpperCase();
      if (seen.has(sym)) return false;
      seen.add(sym);
      return true;
    })
    .slice(0, limit)
    .map((item) => ({
      symbol: item.symbol!.toUpperCase(),
      name: item.longname ?? item.shortname ?? item.symbol!,
      exchange: item.exchDisp ?? item.exchange,
      quoteType: item.quoteType,
    }));
}

export async function fetchQuoteForSymbol(requested: string): Promise<QuoteResult | null> {
  const candidates = resolveYahooSymbolCandidates(requested);

  for (const yahoo of candidates) {
    const v7 = await fetchYahooQuotesV7([requested], [yahoo]);
    const hit = v7.get(requested.toUpperCase());
    if (hit) return hit;

    const quote = await fetchQuoteOne(yahoo, requested, "yahoo");
    if (quote) return quote;
  }

  const searchQueries = [requested];
  if (requested.includes(".")) {
    const base = requested.split(".")[0];
    if (base) searchQueries.push(base);
  }

  for (const query of searchQueries) {
    const searched = await searchYahooSymbol(query);
    if (searched && !candidates.includes(searched)) {
      const v7 = await fetchYahooQuotesV7([requested], [searched]);
      const hit = v7.get(requested.toUpperCase());
      if (hit) return { ...hit, source: "yahoo-search" };

      const quote = await fetchQuoteOne(searched, requested, "yahoo-search");
      if (quote) return quote;
    }
  }

  return null;
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].filter(
    (s) => s !== "CASH"
  );
  if (unique.length === 0) return [];

  const yahooSymbols = unique.map((s) => toYahooSymbol(s));
  const v7Quotes = await fetchYahooQuotesV7(unique, yahooSymbols);

  const results: QuoteResult[] = [];
  const missing: string[] = [];
  for (const requested of unique) {
    const hit = v7Quotes.get(requested);
    if (hit) results.push(hit);
    else missing.push(requested);
  }

  if (missing.length > 0) {
    const fallback = await Promise.all(missing.map((requested) => fetchQuoteForSymbol(requested)));
    for (const q of fallback) {
      if (q) results.push(q);
    }
  }

  return results;
}

export async function fetchDividends(
  symbol: string,
  requestedSymbol?: string
): Promise<DividendEvent[]> {
  const candidates = resolveYahooSymbolCandidates(symbol);
  const yahoo = candidates[0] ?? toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahoo)}?range=2y&interval=1d&events=div`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const json = await res.json();
  const divs = json?.chart?.result?.[0]?.events?.dividends;
  if (!divs) return [];

  const key = (requestedSymbol ?? symbol).toUpperCase();
  return (Object.values(divs) as { date: number; amount: number }[]).map(
    (d) => ({
      symbol: key,
      date: new Date(d.date * 1000).toISOString(),
      amount: d.amount,
    })
  );
}

/** Finnhub fallback — per symbol, tries alias candidates */
export async function fetchQuoteFinnhubOne(
  requestedSymbol: string,
  apiKey: string
): Promise<QuoteResult | null> {
  const candidates = [
    ...resolveYahooSymbolCandidates(requestedSymbol),
    requestedSymbol.toUpperCase(),
  ];

  for (const sym of [...new Set(candidates)]) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) continue;
    const q = (await res.json()) as {
      c?: number;
      d?: number;
      dp?: number;
      pc?: number;
      error?: string;
    };
    if (q.error || !q.c || q.c <= 0) continue;
    const prevClose = q.pc && q.pc > 0 ? q.pc : q.c - (q.d ?? 0);
    return {
      symbol: requestedSymbol.toUpperCase(),
      yahooSymbol: sym,
      price: q.c,
      change: q.d ?? q.c - prevClose,
      changePercent: q.dp ?? (prevClose > 0 ? ((q.c - prevClose) / prevClose) * 100 : 0),
      currency: "USD",
      source: "finnhub",
      marketSession: "regular",
    };
  }
  return null;
}

export async function fetchQuotesFinnhub(
  symbols: string[],
  apiKey: string
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];
  for (const sym of symbols.slice(0, 30)) {
    const quote = await fetchQuoteFinnhubOne(sym, apiKey);
    if (quote) results.push(quote);
  }
  return results;
}

export interface YahooOptionFlow {
  callVolume: number;
  putVolume: number;
  putCallRatio: number;
}

interface YahooOptionContract {
  volume?: number;
  openInterest?: number;
}

interface YahooOptionExpiry {
  calls?: YahooOptionContract[];
  puts?: YahooOptionContract[];
}

function sumOptionSide(contracts: YahooOptionContract[] | undefined): {
  volume: number;
  openInterest: number;
} {
  let volume = 0;
  let openInterest = 0;
  for (const c of contracts ?? []) {
    volume += c.volume ?? 0;
    openInterest += c.openInterest ?? 0;
  }
  return { volume, openInterest };
}

async function fetchYahooOptionsExpiry(
  yahoo: string,
  host: string,
  session: { cookie: string; crumb: string } | null,
  date?: number
): Promise<{
  expirationDates: number[];
  options: YahooOptionExpiry[];
} | null> {
  const params = new URLSearchParams();
  if (session?.crumb) params.set("crumb", session.crumb);
  if (date != null) params.set("date", String(date));
  const qs = params.toString();
  const url = `https://${host}/v7/finance/options/${encodeYahooSymbol(yahoo)}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: session
      ? { ...YAHOO_HEADERS, Cookie: session.cookie }
      : YAHOO_HEADERS,
    next: { revalidate: 900 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    optionChain?: {
      result?: {
        expirationDates?: number[];
        options?: YahooOptionExpiry[];
      }[];
    };
  };
  const result = json.optionChain?.result?.[0];
  if (!result) return null;
  return {
    expirationDates: result.expirationDates ?? [],
    options: result.options ?? [],
  };
}

export async function fetchYahooOptionFlow(symbol: string): Promise<YahooOptionFlow | null> {
  const session = await getYahooSession();
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

  for (const candidate of resolveYahooSymbolCandidates(symbol)) {
    const yahoo = toYahooSymbol(candidate);
    for (const host of hosts) {
      const nearest = await fetchYahooOptionsExpiry(yahoo, host, session);
      if (!nearest?.options.length) continue;

      const extraDates = nearest.expirationDates.filter(Boolean).slice(1, 3);
      const extra = extraDates.length
        ? await Promise.all(
            extraDates.map((date) => fetchYahooOptionsExpiry(yahoo, host, session, date))
          )
        : [];

      const expiries = [
        ...nearest.options,
        ...extra.flatMap((hit) => hit?.options ?? []),
      ];

      let callVolume = 0;
      let callOi = 0;
      let putVolume = 0;
      let putOi = 0;
      for (const expiry of expiries) {
        const calls = sumOptionSide(expiry.calls);
        const puts = sumOptionSide(expiry.puts);
        callVolume += calls.volume;
        callOi += calls.openInterest;
        putVolume += puts.volume;
        putOi += puts.openInterest;
      }

      const useVolume = callVolume + putVolume > 0;
      const calls = useVolume ? callVolume : callOi;
      const puts = useVolume ? putVolume : putOi;
      if (calls + puts === 0) continue;

      return {
        callVolume: calls,
        putVolume: puts,
        putCallRatio: calls > 0 ? puts / calls : 0,
      };
    }
  }

  return null;
}

