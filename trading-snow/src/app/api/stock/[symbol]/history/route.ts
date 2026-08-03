import { NextRequest, NextResponse } from "next/server";
import { CHART_TIMEFRAMES, fetchChartHistory, isChartTimeframe } from "@/lib/chart-history";

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
    const points = await fetchChartHistory(upper, tf);
    return NextResponse.json({ symbol: upper, timeframe: tf, points });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
