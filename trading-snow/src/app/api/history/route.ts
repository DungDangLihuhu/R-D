import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import { fetchCloseHistory, type CloseHistory } from "@/lib/yahoo";

const MAX_SYMBOLS = 20;
/** Gọi Yahoo tối đa chừng này mã cùng lúc — danh mục lớn không làm nổ rate-limit. */
const CONCURRENCY = 5;

/**
 * Giá đóng cửa ngày + các lần split của nhiều mã, từ `from` tới hôm nay — để định
 * giá danh mục ở từng thời điểm trong quá khứ thay vì giá khớp lệnh gần nhất.
 */
export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols");
  const from = req.nextUrl.searchParams.get("from");

  if (!symbolsParam || !from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json(
      { error: "symbols and from (YYYY-MM-DD) required" },
      { status: 400 }
    );
  }

  const fromDate = new Date(`${from}T00:00:00Z`);
  if (isNaN(fromDate.getTime())) {
    return NextResponse.json({ error: "invalid from" }, { status: 400 });
  }

  const symbols = [
    ...new Set(
      symbolsParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== "CASH")
    ),
  ].slice(0, MAX_SYMBOLS);

  const to = new Date();
  const today = to.toISOString().slice(0, 10);
  const series: Record<string, CloseHistory> = {};

  let next = 0;
  const worker = async () => {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      try {
        series[symbol] = await cached(
          cacheKey(["close-history", symbol, from, today]),
          3600_000,
          () => fetchCloseHistory(symbol, fromDate, to)
        );
      } catch {
        // Một mã lỗi không làm hỏng cả lô — client tự rơi về giá khớp gần nhất cho mã đó.
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker)
  );

  return jsonCached({ series }, 3600, 7200);
}
