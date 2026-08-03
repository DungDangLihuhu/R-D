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
      const profile = await fetchSymbolProfile(q.symbol);
      if (profile.name && !q.shortName) q.shortName = profile.name;
      if (profile.logo) q.logo = profile.logo;
    })
  );
}
