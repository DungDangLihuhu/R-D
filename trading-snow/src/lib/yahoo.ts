import { encodeYahooSymbol, toYahooSymbol } from "./symbol";

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TradingSnow/1.0)",
};

export interface QuoteResult {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
  yahooSymbol?: string;
  exchangeName?: string;
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
  const period1 = Math.floor(from.getTime() / 1000);
  const period2 = Math.floor(to.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
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
  requestedSymbol: string
): Promise<QuoteResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeYahooSymbol(yahooSymbol)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 60 } });
  if (!res.ok) return null;

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) return null;

  const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
  const changePercent =
    prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;

  return {
    symbol: requestedSymbol,
    yahooSymbol: meta.symbol ?? yahooSymbol,
    exchangeName: meta.fullExchangeName ?? meta.exchangeName,
    price: meta.regularMarketPrice,
    changePercent,
    currency: meta.currency ?? "USD",
  };
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].filter(
    (s) => s !== "CASH"
  );
  if (unique.length === 0) return [];

  const results = await Promise.all(
    unique.map(async (requested) => {
      const yahoo = toYahooSymbol(requested);
      return fetchQuoteOne(yahoo, requested);
    })
  );
  return results.filter((r): r is QuoteResult => r !== null);
}

export async function fetchDividends(
  symbol: string,
  requestedSymbol?: string
): Promise<DividendEvent[]> {
  const yahoo = toYahooSymbol(symbol);
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

/** Optional Finnhub fallback when FINNHUB_API_KEY is set */
export async function fetchQuotesFinnhub(
  symbols: string[],
  apiKey: string
): Promise<QuoteResult[]> {
  const results: QuoteResult[] = [];
  for (const sym of symbols.slice(0, 30)) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) continue;
    const q = await res.json();
    if (q.c > 0) {
      results.push({
        symbol: sym.toUpperCase(),
        price: q.c,
        changePercent: q.dp ?? 0,
        currency: "USD",
      });
    }
  }
  return results;
}
