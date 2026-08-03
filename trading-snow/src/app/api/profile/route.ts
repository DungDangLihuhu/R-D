import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { fetchSymbolProfile, tickerLabel } from "@/lib/symbol-profile";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const profile = await fetchSymbolProfile(symbol);
  return jsonCached(
    {
      symbol,
      ticker: tickerLabel(symbol),
      name: profile.name,
      logo: profile.logo,
    },
    3600,
    7200
  );
}
