import { resolveYahooSymbolCandidates } from "./symbol";
import type { QuoteResult } from "./yahoo";

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

  const finnhubKey = process.env.FINNHUB_API_KEY;
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

  const twelveKey = process.env.TWELVE_DATA_API_KEY;
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
