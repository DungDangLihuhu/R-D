/** Yahoo / Finnhub ticker → TradingView `EXCHANGE:SYMBOL` */

const YAHOO_SUFFIX_TO_TV: Record<string, string> = {
  PA: "EURONEXT",
  L: "LSE",
  DE: "XETR",
  F: "FWB",
  AS: "EURONEXT",
  BR: "EURONEXT",
  MI: "MIL",
  MC: "BME",
  SW: "SIX",
  ST: "OMXSTO",
  CO: "OMXCOP",
  HE: "OMXHEX",
  OL: "OSL",
  VI: "VIE",
  HK: "HKEX",
  T: "TSE",
  TO: "TSX",
  V: "TSXV",
  AX: "ASX",
  SI: "SGX",
  NZ: "NZX",
  NS: "NSE",
  BO: "BSE",
  VN: "HOSE",
  TW: "TWSE",
  KS: "KRX",
  KQ: "KOSDAQ",
  SA: "BMFBOVESPA",
  MX: "BMV",
};

const EXCHANGE_HINT_TO_TV: Record<string, string> = {
  NASDAQ: "NASDAQ",
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NGSM: "NASDAQ",
  NYSE: "NYSE",
  NYQ: "NYSE",
  AMEX: "AMEX",
  ARCA: "AMEX",
  BATS: "BATS",
  OTC: "OTC",
  PINK: "OTC",
  EURONEXT: "EURONEXT",
  XPAR: "EURONEXT",
  PARIS: "EURONEXT",
  LSE: "LSE",
  XLON: "LSE",
  XETRA: "XETR",
  XETR: "XETR",
  FWB: "FWB",
  HKEX: "HKEX",
  TSE: "TSE",
  TYO: "TSE",
  TSX: "TSX",
  HOSE: "HOSE",
  HNX: "HNX",
};

function normExchangeKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function toTradingViewSymbol(
  symbol: string,
  exchange?: string | null
): string {
  const upper = symbol.trim().toUpperCase().replace(/\s/g, "");
  if (!upper) return "NASDAQ:AAPL";

  const dot = upper.indexOf(".");
  if (dot > 0) {
    const base = upper.slice(0, dot);
    const suffix = upper.slice(dot + 1);
    const tvEx = YAHOO_SUFFIX_TO_TV[suffix];
    if (tvEx) return `${tvEx}:${base}`;
  }

  if (exchange?.trim()) {
    const key = normExchangeKey(exchange);
    const direct = EXCHANGE_HINT_TO_TV[key];
    if (direct) return `${direct}:${upper}`;
    if (key.includes("NASDAQ")) return `NASDAQ:${upper}`;
    if (key.includes("NYSE") || key.includes("NEWYORK")) return `NYSE:${upper}`;
    if (key.includes("ARCA") || key.includes("AMEX")) return `AMEX:${upper}`;
    if (key.includes("EURONEXT") || key.includes("PARIS")) return `EURONEXT:${upper}`;
  }

  return `NASDAQ:${upper}`;
}
