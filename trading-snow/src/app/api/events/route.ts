import { NextRequest, NextResponse } from "next/server";
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
    const events = await fetchPortfolioEvents([], from, to, eventOptions);
    return NextResponse.json({
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
    });
  }

  const list = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && s !== "CASH");

  try {
    const events = await fetchPortfolioEvents(list, from, to, eventOptions);
    return NextResponse.json({
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
