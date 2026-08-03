import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import { fetchPortfolioEvents } from "@/lib/events";

const MACRO_SOURCES = "Finnhub economic calendar (1 tháng) · fallback Forex Factory";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  const from =
    req.nextUrl.searchParams.get("from") ??
    new Date().toISOString().slice(0, 10);
  const to =
    req.nextUrl.searchParams.get("to") ??
    new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const macroFrom = req.nextUrl.searchParams.get("macroFrom") ?? from;
  const macroTo = req.nextUrl.searchParams.get("macroTo") ?? to;

  const eventOptions = { macroFrom, macroTo };

  if (!symbols) {
    const events = await cached(cacheKey(["events", "none", from, to, macroFrom, macroTo]), 300_000, () =>
      fetchPortfolioEvents([], from, to, eventOptions)
    );
    return jsonCached(
      {
        events,
        from,
        to,
        macroFrom,
        macroTo,
        updatedAt: new Date().toISOString(),
        sources: {
          dividends: "Yahoo Finance + ước tính",
          earnings: "Finnhub",
          news: "Finnhub",
          macro: MACRO_SOURCES,
          holidays: "Finnhub US exchange hoặc lịch NYSE/Nasdaq tính sẵn",
        },
      },
      300,
      600
    );
  }

  const list = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && s !== "CASH");

  try {
    const events = await cached(
      cacheKey(["events", list.join(","), from, to, macroFrom, macroTo]),
      300_000,
      () => fetchPortfolioEvents(list, from, to, eventOptions)
    );
    return jsonCached(
      {
        events,
        from,
        to,
        macroFrom,
        macroTo,
        updatedAt: new Date().toISOString(),
        sources: {
          dividends: "Yahoo Finance + ước tính",
          earnings: "Finnhub",
          news: "Finnhub",
          macro: MACRO_SOURCES,
          holidays: "Finnhub US exchange hoặc lịch NYSE/Nasdaq tính sẵn",
        },
      },
      300,
      600
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
