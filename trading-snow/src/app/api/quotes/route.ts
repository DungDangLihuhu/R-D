import { NextRequest, NextResponse } from "next/server";
import { fillMissingQuotes } from "@/lib/quote-providers";
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
    const quotes = await fetchQuotes(list);
    const prices: Record<string, number> = {};
    for (const q of quotes) {
      if (q.price > 0) prices[q.symbol] = q.price;
    }

    const missing = list.filter((s) => !prices[s]);
    const unresolved = await fillMissingQuotes(missing, prices, quotes);

    return NextResponse.json({
      quotes,
      prices,
      updatedAt: new Date().toISOString(),
      unresolved,
      providers: {
        yahoo: true,
        finnhub: Boolean(process.env.FINNHUB_API_KEY),
        twelveData: Boolean(process.env.TWELVE_DATA_API_KEY),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
