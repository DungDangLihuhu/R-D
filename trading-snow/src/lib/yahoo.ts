import {
  encodeYahooSymbol,
  resolveYahooSymbolCandidates,
  toYahooSymbol,
} from "./symbol";

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
  source?: "yahoo" | "finnhub" | "yahoo-search" | "twelve-data";
}

export interface DividendEvent {
  symbol: string;
  date: string;
  amount: number;
}

export interface HistoryPoint {
  date: string;
  close: number;
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

async function fetchQuoteOne(
  yahooSymbol: string,
  requestedSymbol: string,
  source: QuoteResult["source"] = "yahoo"
): Promise<QuoteResult | null> {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 60 } });
    if (!res.ok) continue;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) continue;

    const prev =
      meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
    const change = meta.regularMarketPrice - prev;
    const changePercent = prev > 0 ? (change / prev) * 100 : 0;

    return {
      symbol: requestedSymbol,
      yahooSymbol: meta.symbol ?? yahooSymbol,
      exchangeName: meta.fullExchangeName ?? meta.exchangeName,
      shortName: meta.shortName ?? meta.longName,
      price: meta.regularMarketPrice,
      change,
      changePercent,
      currency: meta.currency ?? "USD",
      source,
    };
  }

  return null;
}

async function searchYahooSymbol(query: string): Promise<string | null> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const json = await res.json();
  const quotes: { symbol?: string; quoteType?: string }[] = json?.quotes ?? [];
  const equity = quotes.find(
    (q) =>
      q.symbol &&
      (q.quoteType === "EQUITY" || q.quoteType === "ETF" || !q.quoteType)
  );
  return equity?.symbol?.toUpperCase() ?? null;
}

async function fetchQuoteForSymbol(requested: string): Promise<QuoteResult | null> {
  const candidates = resolveYahooSymbolCandidates(requested);

  for (const yahoo of candidates) {
    const quote = await fetchQuoteOne(yahoo, requested, "yahoo");
    if (quote) return quote;
  }

  const searched = await searchYahooSymbol(requested);
  if (searched && !candidates.includes(searched)) {
    const quote = await fetchQuoteOne(searched, requested, "yahoo-search");
    if (quote) return quote;
  }

  return null;
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].filter(
    (s) => s !== "CASH"
  );
  if (unique.length === 0) return [];

  const results = await Promise.all(unique.map((requested) => fetchQuoteForSymbol(requested)));
  return results.filter((r): r is QuoteResult => r !== null);
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
    const q = await res.json();
    if (q.c > 0) {
      return {
        symbol: requestedSymbol.toUpperCase(),
        yahooSymbol: sym,
        price: q.c,
        change: q.d ?? 0,
        changePercent: q.dp ?? 0,
        currency: "USD",
        source: "finnhub",
      };
    }
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
