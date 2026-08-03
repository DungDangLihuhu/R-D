import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import {
  fetchStockAnalysis,
  fetchStockAnalysisExtra,
} from "@/lib/stock-analysis";

const CORE_TTL = 5 * 60 * 1000;
const EXTRA_TTL = 10 * 60 * 1000;

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
    const core = await cached(cacheKey(["stock", upper]), CORE_TTL, () =>
      fetchStockAnalysis(upper)
    );
    if (!core || !core.metrics) {
      return NextResponse.json({ error: "Không tìm thấy dữ liệu mã này" }, { status: 404 });
    }

    const extra = await cached(cacheKey(["stock-extra", upper]), EXTRA_TTL, () =>
      fetchStockAnalysisExtra(upper, {
        symbol: core.symbol,
        price: core.price,
        sections: core.sections,
        priceHistory: core.priceHistory,
        priceLevels: core.priceLevels,
        recommendations: core.recommendations,
        metrics: core.metrics ?? {},
      })
    );

    return jsonCached(extra, 600, 1200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
