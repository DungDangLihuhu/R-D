import { NextRequest, NextResponse } from "next/server";
import { fetchQuoteFinnhubOne, fetchQuotes } from "@/lib/yahoo";

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
    const quotes = await fetchQuotes(list);
    const prices: Record<string, number> = {};
    for (const q of quotes) {
      if (q.price > 0) prices[q.symbol] = q.price;
    }

    const finnhubKey = process.env.FINNHUB_API_KEY;
    const missing = list.filter((s) => !prices[s]);

    if (finnhubKey && missing.length > 0) {
      const fallback = await Promise.all(
        missing.map((sym) => fetchQuoteFinnhubOne(sym, finnhubKey))
      );
      for (const q of fallback) {
        if (!q || q.price <= 0) continue;
        quotes.push(q);
        prices[q.symbol] = q.price;
      }
    }

    return NextResponse.json({
      quotes,
      prices,
      updatedAt: new Date().toISOString(),
      unresolved: list.filter((s) => !prices[s]),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
