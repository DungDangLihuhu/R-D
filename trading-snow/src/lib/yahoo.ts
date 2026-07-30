const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TradingSnow/1.0)",
};

export interface QuoteResult {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
}

export interface DividendEvent {
  symbol: string;
  date: string;
  amount: number;
}

async function fetchQuoteOne(symbol: string): Promise<QuoteResult | null> {
  const sym = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 60 } });
  if (!res.ok) return null;

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) return null;

  const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
  const changePercent =
    prev > 0 ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;

  return {
    symbol: meta.symbol ?? sym,
    price: meta.regularMarketPrice,
    changePercent,
    currency: meta.currency ?? "USD",
  };
}

export async function fetchQuotes(symbols: string[]): Promise<QuoteResult[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
    (s) => s !== "CASH"
  );
  if (unique.length === 0) return [];

  const results = await Promise.all(unique.map(fetchQuoteOne));
  return results.filter((r): r is QuoteResult => r !== null);
}

export async function fetchDividends(symbol: string): Promise<DividendEvent[]> {
  const sym = symbol.toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=2y&interval=1d&events=div`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const json = await res.json();
  const divs = json?.chart?.result?.[0]?.events?.dividends;
  if (!divs) return [];

  return (Object.values(divs) as { date: number; amount: number }[]).map(
    (d) => ({
      symbol: sym,
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
    const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${apiKey}`;
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
