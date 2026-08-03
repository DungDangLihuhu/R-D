import { NextRequest, NextResponse } from "next/server";
import { fetchPriceHistory } from "@/lib/yahoo";

const BENCHMARK = "SPY";

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to required (YYYY-MM-DD)" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  if (fromDate.getTime() >= toDate.getTime()) {
    fromDate.setDate(fromDate.getDate() - 30);
  }

  toDate.setHours(23, 59, 59, 999);

  try {
    let points = await fetchPriceHistory(BENCHMARK, fromDate, toDate);
    if (points.length === 0) {
      points = await fetchPriceHistory("^GSPC", fromDate, toDate);
    }
    return NextResponse.json({
      symbol: points.length > 0 ? BENCHMARK : "^GSPC",
      label: "S&P 500",
      points,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
