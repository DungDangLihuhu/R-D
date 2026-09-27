import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { cacheKey, cached } from "@/lib/server-cache";
import { fetchCloseHistory } from "@/lib/yahoo";

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

  // Kỳ tới hôm nay có phiên đang chạy: giữ tối đa 5 phút như giá danh mục (tự refresh mỗi
  // 5 phút), không thì điểm cuối của S&P cũ hơn điểm cuối của danh mục cả tiếng.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const live = to >= yesterday;
  const ttlSeconds = live ? 300 : 3600;
  const options = { adjusted: true, dividends: true, revalidateSeconds: ttlSeconds };

  try {
    // Giá kèm cổ tức của SPY: client tự cộng cổ tức (trừ cùng mức thuế như cổ tức của danh
    // mục) để S&P 500 và danh mục tính cổ tức giống nhau.
    let symbol = BENCHMARK;
    let history = await cached(cacheKey(["benchmark-div", BENCHMARK, from, to]), ttlSeconds * 1000, () =>
      fetchCloseHistory(BENCHMARK, fromDate, toDate, options)
    );
    if (history.points.length === 0) {
      symbol = "^GSPC";
      history = await cached(cacheKey(["benchmark-div", "^GSPC", from, to]), ttlSeconds * 1000, () =>
        fetchCloseHistory("^GSPC", fromDate, toDate, options)
      );
    }
    return jsonCached(
      {
        symbol,
        label: "S&P 500",
        points: history.points,
        // ^GSPC là chỉ số giá, không có cổ tức.
        ...(symbol === BENCHMARK && { dividends: history.dividends ?? [] }),
        updatedAt: new Date().toISOString(),
      },
      ttlSeconds,
      ttlSeconds * 2
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
