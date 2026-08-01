/**
 * Resolve broker/Snowball tickers to Yahoo Finance symbols (e.g. SAN + PA → SAN.PA).
 * @see https://help.yahoo.com/kb/finance-for-web/SLN2310.html
 */

const YAHOO_SUFFIXES = new Set([
  "PA",
  "L",
  "DE",
  "F",
  "AS",
  "BR",
  "MI",
  "MC",
  "SW",
  "ST",
  "CO",
  "HE",
  "OL",
  "VI",
  "LS",
  "IR",
  "HK",
  "T",
  "TO",
  "V",
  "AX",
  "SI",
  "NZ",
  "KS",
  "KQ",
  "TW",
  "NS",
  "BO",
  "SA",
  "MX",
  "VN",
  "WA",
  "BK",
  "SS",
  "SZ",
  "JK",
  "KL",
  "IS",
  "ME",
  "QA",
  "SR",
  "TA",
  "IL",
]);

/** Broker / MIC / Snowball exchange code → Yahoo suffix */
const EXCHANGE_TO_SUFFIX: Record<string, string> = {
  US: "",
  USA: "",
  NMS: "",
  NGM: "",
  NCM: "",
  NGSM: "",
  NYQ: "",
  NYSE: "",
  NASDAQ: "",
  ARCA: "",
  BATS: "",
  AMEX: "",
  OTC: "",
  PINK: "",

  PA: "PA",
  PAR: "PA",
  XPAR: "PA",
  PARIS: "PA",
  EURONEXTPARIS: "PA",
  "EURONEXT-PARIS": "PA",
  "EURONEXT PARIS": "PA",

  L: "L",
  LSE: "L",
  LON: "L",
  XLON: "L",
  LONDON: "L",

  DE: "DE",
  XETRA: "DE",
  XETR: "DE",
  GER: "DE",
  GERMANY: "DE",
  F: "F",
  XFRA: "F",
  FRANKFURT: "F",

  AS: "AS",
  AMS: "AS",
  XAMS: "AS",
  AMSTERDAM: "AS",

  BR: "BR",
  XBRU: "BR",
  BRUSSELS: "BR",

  MI: "MI",
  XMIL: "MI",
  MILAN: "MI",

  MC: "MC",
  XMAD: "MC",
  MADRID: "MC",

  SW: "SW",
  SIX: "SW",
  XSWX: "SW",
  SWISS: "SW",

  ST: "ST",
  XSTO: "ST",
  STOCKHOLM: "ST",

  CO: "CO",
  XCSE: "CO",
  COPENHAGEN: "CO",

  HE: "HE",
  XHEL: "HE",
  HELSINKI: "HE",

  OL: "OL",
  XOSL: "OL",
  OSLO: "OL",

  VI: "VI",
  XWBO: "VI",
  VIENNA: "VI",

  LS: "LS",
  XLIS: "LS",

  IR: "IR",
  XDUB: "IR",
  DUBLIN: "IR",

  HK: "HK",
  XHKG: "HK",
  HKG: "HK",
  HONGKONG: "HK",

  T: "T",
  TYO: "T",
  XTKS: "T",
  TOKYO: "T",
  JPX: "T",

  TO: "TO",
  TSX: "TO",
  XTSE: "TO",
  TORONTO: "TO",

  V: "V",
  TSXV: "V",
  CVE: "V",

  AX: "AX",
  ASX: "AX",
  XASX: "AX",
  AUSTRALIA: "AX",

  SI: "SI",
  SGX: "SI",
  XSES: "SI",
  SINGAPORE: "SI",

  NZ: "NZ",
  XNZE: "NZ",

  KS: "KS",
  KRX: "KS",
  KOSPI: "KS",

  KQ: "KQ",
  KOSDAQ: "KQ",

  TW: "TW",
  TWSE: "TW",
  TAIWAN: "TW",

  NS: "NS",
  NSE: "NS",
  XBOM: "BO",
  BO: "BO",
  BSE: "BO",

  SA: "SA",
  BVMF: "SA",
  BRAZIL: "SA",

  MX: "MX",
  BMV: "MX",

  VN: "VN",
  HOSE: "VN",
  HNX: "VN",
  UPCOM: "VN",
  VIETNAM: "VN",

  WA: "WA",
  WSE: "WA",
  POLAND: "WA",
};

/** Country name (Snowball export) → Yahoo suffix */
const COUNTRY_TO_SUFFIX: Record<string, string> = {
  UNITEDSTATESOFAMERICA: "",
  UNITEDSTATES: "",
  USA: "",
  US: "",

  FRANCE: "PA",
  UNITEDKINGDOM: "L",
  GREATBRITAIN: "L",
  UK: "L",
  ENGLAND: "L",

  GERMANY: "DE",
  NETHERLANDS: "AS",
  BELGIUM: "BR",
  ITALY: "MI",
  SPAIN: "MC",
  SWITZERLAND: "SW",
  SWEDEN: "ST",
  DENMARK: "CO",
  FINLAND: "HE",
  NORWAY: "OL",
  AUSTRIA: "VI",
  PORTUGAL: "LS",
  IRELAND: "IR",
  POLAND: "WA",

  CANADA: "TO",
  AUSTRALIA: "AX",
  NEWZEALAND: "NZ",
  JAPAN: "T",
  HONGKONG: "HK",
  SINGAPORE: "SI",
  SOUTHKOREA: "KS",
  KOREA: "KS",
  TAIWAN: "TW",
  INDIA: "NS",
  CHINA: "SS",
  BRAZIL: "SA",
  MEXICO: "MX",
  VIETNAM: "VN",
};

function normKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function suffixFromExchange(exchange?: string | null): string | null {
  if (!exchange?.trim()) return null;
  const key = normKey(exchange);
  if (key in EXCHANGE_TO_SUFFIX) return EXCHANGE_TO_SUFFIX[key];
  if (YAHOO_SUFFIXES.has(key)) return key;
  return null;
}

function suffixFromCountry(country?: string | null): string | null {
  if (!country?.trim()) return null;
  const key = normKey(country);
  if (key in COUNTRY_TO_SUFFIX) return COUNTRY_TO_SUFFIX[key];
  return null;
}

function hasYahooSuffix(symbol: string): boolean {
  const dot = symbol.lastIndexOf(".");
  if (dot <= 0 || dot === symbol.length - 1) return false;
  const suffix = symbol.slice(dot + 1);
  return YAHOO_SUFFIXES.has(suffix);
}

/** Normalize ticker for storage and Yahoo API lookup */
export function toYahooSymbol(
  ticker: string,
  exchange?: string | null,
  country?: string | null
): string {
  const raw = ticker.trim().toUpperCase().replace(/\s/g, "");
  if (!raw || raw === "CASH") return raw;

  if (hasYahooSuffix(raw)) return raw;

  const fromExchange = suffixFromExchange(exchange);
  if (fromExchange !== null) {
    return fromExchange ? `${raw}.${fromExchange}` : raw;
  }

  const fromCountry = suffixFromCountry(country);
  if (fromCountry !== null) {
    return fromCountry ? `${raw}.${fromCountry}` : raw;
  }

  return raw;
}

export function encodeYahooSymbol(symbol: string): string {
  return encodeURIComponent(symbol.toUpperCase());
}

/**
 * Broker / Snowball / OTC tickers → alternate Yahoo symbols (fallback order).
 * Only used when the primary symbol returns no quote.
 */
export const YAHOO_SYMBOL_ALIASES: Record<string, string[]> = {
  // TotalEnergies OTC & legacy
  TTFNF: ["TTE.PA", "TOT"],
  TTF: ["TTE.PA", "TOT"],
  FP: ["TTE.PA", "FP.PA"],
  TTE: ["TTE.PA"],
  TOT: ["TTE.PA", "TOT"],

  // Euronext Paris (when imported without .PA suffix)
  BNP: ["BNP.PA"],
  GLE: ["GLE.PA"],
  CS: ["CS.PA"],
  BVI: ["BVI.PA"],
  EDEN: ["EDEN.PA"],
  SAN: ["SAN.PA"],
  MC: ["MC.PA"],
  OR: ["OR.PA"],
  AI: ["AI.PA"],
  SU: ["SU.PA"],
  DG: ["DG.PA"],
  KER: ["KER.PA"],
  RMS: ["RMS.PA"],
  EL: ["EL.PA"],
  VIV: ["VIV.PA"],
  CAP: ["CAP.PA"],
  PUB: ["PUB.PA"],
  HO: ["HO.PA"],
  LR: ["LR.PA"],
  RI: ["RI.PA"],
  EN: ["EN.PA"],
  ENGI: ["ENGI.PA"],
  ACA: ["ACA.PA"],
  ML: ["ML.PA"],
  VIE: ["VIE.PA"],
  URW: ["URW.PA"],
  STM: ["STM.PA"],
  STMPA: ["STM.PA"],

  // US leveraged ETFs (some brokers use odd tickers)
  UPRO: ["UPRO"],
  SSO: ["SSO"],
};

/** Yahoo symbols to try for quote lookup, in order */
export function resolveYahooSymbolCandidates(ticker: string): string[] {
  const upper = ticker.trim().toUpperCase().replace(/\s/g, "");
  if (!upper || upper === "CASH") return [];

  const candidates: string[] = [];
  const add = (s: string) => {
    const v = s.trim().toUpperCase();
    if (v && !candidates.includes(v)) candidates.push(v);
  };

  add(toYahooSymbol(upper));

  const bare = upper.includes(".") ? upper.split(".")[0] : upper;
  const aliasLists = [YAHOO_SYMBOL_ALIASES[upper], YAHOO_SYMBOL_ALIASES[bare]];
  for (const list of aliasLists) {
    if (!list) continue;
    for (const alias of list) add(alias);
  }

  // Suffixed symbol (e.g. BNP.PA) → try base ticker if Yahoo has no .PA listing
  if (upper.includes(".") && bare && bare !== upper) {
    add(bare);
  }

  return candidates;
}

