import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
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
    let points = await cached(cacheKey(["benchmark", BENCHMARK, from, to]), 3600_000, () =>
      fetchPriceHistory(BENCHMARK, fromDate, toDate)
    );
    if (points.length === 0) {
      points = await cached(cacheKey(["benchmark", "^GSPC", from, to]), 3600_000, () =>
        fetchPriceHistory("^GSPC", fromDate, toDate)
      );
    }
    return jsonCached(
      {
        symbol: points.length > 0 ? BENCHMARK : "^GSPC",
        label: "S&P 500",
        points,
        updatedAt: new Date().toISOString(),
      },
      3600,
      7200
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
