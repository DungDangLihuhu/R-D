import { getFinnhubApiKey } from "./quote-config";
import { resolveYahooSymbolCandidates } from "./symbol";
import type { QuoteResult } from "./yahoo";

export interface SymbolProfile {
  name?: string;
  logo?: string;
}

const profileCache = new Map<string, { data: SymbolProfile; at: number }>();
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export function tickerLabel(symbol: string): string {
  if (symbol === "CASH") return "CASH";
  return symbol.includes(".") ? symbol.split(".")[0] : symbol;
}

/** Hậu tố sàn của Yahoo → tên sàn ngắn. */
const EXCHANGE_NAMES: Record<string, string> = {
  PA: "Paris", L: "London", IL: "London", DE: "Xetra", F: "Frankfurt", AS: "Amsterdam",
  BR: "Brussels", MI: "Milan", MC: "Madrid", LS: "Lisbon", SW: "Zurich", VI: "Vienna",
  ST: "Stockholm", OL: "Oslo", CO: "Copenhagen", HE: "Helsinki", IR: "Dublin", WA: "Warsaw",
  TO: "Toronto", V: "TSX-V", NE: "NEO", MX: "Mexico", SA: "São Paulo", HK: "Hong Kong",
  T: "Tokyo", KS: "Korea", KQ: "KOSDAQ", SS: "Shanghai", SZ: "Shenzhen", TW: "Taiwan",
  TWO: "Taiwan OTC", SI: "Singapore", AX: "ASX", NZ: "NZX", NS: "NSE", BO: "BSE",
  JK: "Jakarta", BK: "Bangkok", KL: "Kuala Lumpur", VN: "HOSE", TA: "Tel Aviv",
  JO: "Johannesburg",
};

/**
 * Ký hiệu kèm sàn cho mã ngoài Mỹ: "SAN.PA" → "SAN · Paris". Chỉ cắt đuôi thì Sanofi
 * (SAN.PA) trông như Santander (SAN, NYSE).
 */
export function tickerWithExchange(symbol: string): string {
  const upper = symbol.toUpperCase();
  const dot = upper.lastIndexOf(".");
  if (upper === "CASH" || dot <= 0) return tickerLabel(symbol);
  const exchange = EXCHANGE_NAMES[upper.slice(dot + 1)];
  return exchange ? `${upper.slice(0, dot)} · ${exchange}` : upper;
}

export async function fetchSymbolProfile(symbol: string): Promise<SymbolProfile> {
  const key = symbol.trim().toUpperCase();
  if (!key || key === "CASH") return {};

  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) {
    return cached.data;
  }

  const data = await fetchFinnhubProfile(key);
  profileCache.set(key, { data, at: Date.now() });
  return data;
}

async function fetchFinnhubProfile(symbol: string): Promise<SymbolProfile> {
  const apiKey = getFinnhubApiKey();
  if (!apiKey) return {};

  for (const sym of resolveYahooSymbolCandidates(symbol)) {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 86_400 } });
    if (!res.ok) continue;

    const data = (await res.json()) as {
      name?: string;
      logo?: string;
      error?: string;
    };
    if (data.error) continue;
    if (data.logo || data.name) {
      return { name: data.name, logo: data.logo };
    }
  }

  return {};
}

/** Gắn logo + tên công ty vào quote (Finnhub profile). */
export async function enrichQuotesWithProfiles(
  quotes: QuoteResult[]
): Promise<void> {
  if (!getFinnhubApiKey() || quotes.length === 0) return;

  await Promise.all(
    quotes.map(async (q) => {
      if (q.logo && q.shortName) return;
      if (q.logo && !q.shortName) {
        const profile = await fetchSymbolProfile(q.symbol);
        if (profile.name) q.shortName = profile.name;
        return;
      }
      const profile = await fetchSymbolProfile(q.symbol);
      if (profile.name && !q.shortName) q.shortName = profile.name;
      if (profile.logo) q.logo = profile.logo;
    })
  );
}
