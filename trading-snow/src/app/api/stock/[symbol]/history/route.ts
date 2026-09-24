import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import {
  CHART_TIMEFRAMES,
  fetchFullChartHistory,
  isChartTimeframe,
  limitChartBars,
  movingAverages,
} from "@/lib/chart-history";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol?.trim().toUpperCase();
  if (!upper) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const tf = req.nextUrl.searchParams.get("timeframe") ?? "1d";
  if (!isChartTimeframe(tf)) {
    return NextResponse.json(
      { error: `timeframe must be one of: ${CHART_TIMEFRAMES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const payload = await cached(cacheKey(["chart-ma", upper, tf]), 300_000, async () => {
      const full = await fetchFullChartHistory(upper, tf);
      const points = limitChartBars(full, tf);
      // MA tính trên cả khoảng đã tải, trả kèm đúng số nến hiển thị.
      return { points, ma: movingAverages(full, points.length) };
    });
    return jsonCached({ symbol: upper, timeframe: tf, ...payload }, 300, 600);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
