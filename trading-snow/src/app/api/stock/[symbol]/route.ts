import { NextRequest, NextResponse } from "next/server";
import { fetchStockAnalysis } from "@/lib/stock-analysis";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const upper = symbol?.trim().toUpperCase();
  if (!upper) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const data = await fetchStockAnalysis(upper);
    if (!data) {
      return NextResponse.json({ error: "Không tìm thấy dữ liệu mã này" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
