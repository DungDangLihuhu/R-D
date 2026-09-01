import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { fetchSymbolProfile, tickerLabel } from "@/lib/symbol-profile";

const MAX_SYMBOLS = 100;

export async function GET(req: NextRequest) {
  const raw =
    req.nextUrl.searchParams.get("symbols") ??
    req.nextUrl.searchParams.get("symbol") ??
    "";

  const symbols = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== "CASH")
    ),
  ].slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const profiles = await Promise.all(
    symbols.map(async (symbol) => {
      const profile = await fetchSymbolProfile(symbol);
      return {
        symbol,
        ticker: tickerLabel(symbol),
        name: profile.name,
        logo: profile.logo,
      };
    })
  );

  return jsonCached({ profiles }, 3600, 7200);
}
