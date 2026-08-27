import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import { fetchQuotesForSymbols } from "@/lib/quote-providers";
import { scanWyckoffSignals } from "@/lib/scan-wyckoff-signals";

async function buildSignals(symbols: string[]) {
  const quotes = await fetchQuotesForSymbols(symbols);
  const signals = await scanWyckoffSignals(symbols, quotes.prices);
  return {
    signals,
    scanned: symbols.length,
    unresolved: quotes.unresolved,
    prices: quotes.prices,
    quotes: quotes.quotes.map((q) => ({
      symbol: q.symbol,
      price: q.price,
      name: q.shortName,
      logo: q.logo,
      changePercent: q.changePercent,
    })),
  };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  const symbols = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== "CASH")
    ),
  ].sort();

  if (!symbols.length) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }
  if (symbols.length > 150) {
    return NextResponse.json({ error: "too many symbols" }, { status: 400 });
  }

  try {
    const payload = refresh
      ? await buildSignals(symbols)
      : await cached(cacheKey(["signals", ...symbols]), 120_000, () => buildSignals(symbols));
    return jsonCached(payload, refresh ? 0 : 120, refresh ? 0 : 300);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scan failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
