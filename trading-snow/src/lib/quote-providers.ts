import { getFinnhubApiKey, getTwelveDataApiKey } from "./quote-config";
import { resolveYahooSymbolCandidates } from "./symbol";
import { fetchQuotes, type QuoteResult } from "./yahoo";

/** Yahoo/backup providers — process in chunks to avoid timeouts & rate limits */
export const QUOTE_BATCH_SIZE = 40;
export const QUOTE_MAX_SYMBOLS = 150;

const SUFFIX_TO_TD_EXCHANGE: Record<string, string> = {
  PA: "XPAR",
  L: "LSE",
  DE: "XETR",
  F: "XFRA",
  AS: "XAMS",
  MI: "XMIL",
  MC: "XMAD",
  SW: "XSWX",
  ST: "XSTO",
  HE: "XHEL",
  CO: "XCSE",
  OL: "XOSL",
  VI: "XWBO",
  T: "XTKS",
  TO: "XTSE",
  AX: "XASX",
  HK: "XHKG",
  NS: "XNSE",
  BO: "XBOM",
};

function twelveDataParams(symbol: string): URLSearchParams {
  const params = new URLSearchParams();
  if (symbol.includes(".")) {
    const [base, suffix] = symbol.split(".");
    const exchange = SUFFIX_TO_TD_EXCHANGE[suffix];
    if (exchange) {
      params.set("symbol", base);
      params.set("exchange", exchange);
      return params;
    }
  }
  params.set("symbol", symbol);
  return params;
}

export async function fetchQuoteTwelveDataOne(
  requestedSymbol: string,
  apiKey: string
): Promise<QuoteResult | null> {
  const candidates = [
    ...resolveYahooSymbolCandidates(requestedSymbol),
    requestedSymbol.toUpperCase(),
  ];

  for (const sym of [...new Set(candidates)]) {
    const params = twelveDataParams(sym);
    params.set("apikey", apiKey);
    const res = await fetch(
      `https://api.twelvedata.com/price?${params.toString()}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) continue;

    const data = (await res.json()) as {
      price?: string;
      code?: number;
      message?: string;
    };
    if (data.code && data.code !== 200) continue;

    const price = parseFloat(data.price ?? "0");
    if (price > 0) {
      return {
        symbol: requestedSymbol.toUpperCase(),
        yahooSymbol: sym,
        price,
        change: 0,
        changePercent: 0,
        currency: "USD",
        source: "twelve-data",
      };
    }
  }

  return null;
}

export async function fillMissingQuotes(
  missing: string[],
  prices: Record<string, number>,
  quotes: QuoteResult[]
): Promise<string[]> {
  let unresolved = [...missing];

  const finnhubKey = getFinnhubApiKey();
  if (finnhubKey && unresolved.length > 0) {
    const { fetchQuoteFinnhubOne } = await import("./yahoo");
    const results = await Promise.all(
      unresolved.map((sym) => fetchQuoteFinnhubOne(sym, finnhubKey))
    );
    for (const q of results) {
      if (!q || q.price <= 0) continue;
      quotes.push(q);
      prices[q.symbol] = q.price;
    }
    unresolved = unresolved.filter((s) => !prices[s]);
  }

  const twelveKey = getTwelveDataApiKey();
  if (twelveKey && unresolved.length > 0) {
    const results = await Promise.all(
      unresolved.map((sym) => fetchQuoteTwelveDataOne(sym, twelveKey))
    );
    for (const q of results) {
      if (!q || q.price <= 0) continue;
      quotes.push(q);
      prices[q.symbol] = q.price;
    }
    unresolved = unresolved.filter((s) => !prices[s]);
  }

  return unresolved;
}

export interface QuotesFetchResult {
  quotes: QuoteResult[];
  prices: Record<string, number>;
  unresolved: string[];
  requested: number;
  truncated: boolean;
}

function normalizeSymbolList(symbols: string[]): string[] {
  return [
    ...new Set(
      symbols
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .filter((s) => s !== "CASH")
    ),
  ];
}

/** Fetch quotes for many symbols — auto-batches (40/request, max 150). */
export async function fetchQuotesForSymbols(
  symbols: string[]
): Promise<QuotesFetchResult> {
  const normalized = normalizeSymbolList(symbols);
  const requested = normalized.length;
  const list = normalized.slice(0, QUOTE_MAX_SYMBOLS);
  const quotes: QuoteResult[] = [];
  const prices: Record<string, number> = {};
  const quoteBySymbol = new Map<string, QuoteResult>();

  for (let i = 0; i < list.length; i += QUOTE_BATCH_SIZE) {
    const chunk = list.slice(i, i + QUOTE_BATCH_SIZE);
    const chunkQuotes = await fetchQuotes(chunk);
    for (const q of chunkQuotes) {
      if (q.price <= 0) continue;
      quoteBySymbol.set(q.symbol, q);
      prices[q.symbol] = q.price;
    }

    const missing = chunk.filter((s) => !prices[s]);
    const chunkQuotesArr = [...quoteBySymbol.values()];
    await fillMissingQuotes(missing, prices, chunkQuotesArr);
    for (const q of chunkQuotesArr) {
      if (q.price > 0) quoteBySymbol.set(q.symbol, q);
    }
  }

  for (const q of quoteBySymbol.values()) {
    quotes.push(q);
  }

  const unresolved = list.filter((s) => !prices[s]);

  return {
    quotes,
    prices,
    unresolved,
    requested,
    truncated: requested > QUOTE_MAX_SYMBOLS,
  };
}
