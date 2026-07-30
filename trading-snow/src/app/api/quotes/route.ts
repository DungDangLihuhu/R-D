import { NextRequest, NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/yahoo";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const list = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  try {
    let quotes = await fetchQuotes(list);
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (quotes.length === 0 && finnhubKey) {
      const { fetchQuotesFinnhub } = await import("@/lib/yahoo");
      quotes = await fetchQuotesFinnhub(list, finnhubKey);
    }
    const prices: Record<string, number> = {};
    for (const q of quotes) {
      if (q.price > 0) prices[q.symbol] = q.price;
    }
    return NextResponse.json({ quotes, prices, updatedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
