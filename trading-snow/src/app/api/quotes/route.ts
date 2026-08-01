import { NextRequest, NextResponse } from "next/server";
import { inspectFinnhubKey, inspectTwelveDataKey } from "@/lib/quote-config";
import { fillMissingQuotes } from "@/lib/quote-providers";
import { fetchQuoteFinnhubOne, fetchQuotes } from "@/lib/yahoo";

async function runQuoteCheck() {
  const finnhub = inspectFinnhubKey(process.env.FINNHUB_API_KEY);
  const twelveData = inspectTwelveDataKey(process.env.TWELVE_DATA_API_KEY);

  const yahooTest = await fetchQuotes(["AAPL", "BNP.PA"]);
  const yahooOk = yahooTest.length > 0;

  let finnhubTest: { ok: boolean; price?: number; error?: string } | null = null;
  if (finnhub.configured && finnhub.valid) {
    const q = await fetchQuoteFinnhubOne("AAPL", process.env.FINNHUB_API_KEY!);
    finnhubTest = q
      ? { ok: true, price: q.price }
      : { ok: false, error: "Finnhub không trả giá AAPL — kiểm tra key hoặc quota" };
  } else if (finnhub.configured) {
    finnhubTest = { ok: false, error: finnhub.hint };
  }

  return {
    yahoo: { ok: yahooOk, samples: yahooTest.map((q) => q.symbol) },
    finnhub,
    finnhubTest,
    twelveData,
    steps: [
      "1. Key Finnhub lấy tại https://finnhub.io/dashboard (KHÔNG dùng Stripe sk_live_…)",
      "2. Vercel env: FINNHUB_API_KEY = key Finnhub (Production + Preview)",
      "3. Redeploy sau khi đổi env",
      "4. Bấm Refresh giá trên Danh mục",
      "5. Yahoo lấy được US + .PA; Finnhub free chủ yếu US realtime",
    ],
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("check") === "1") {
    return NextResponse.json(await runQuoteCheck());
  }

  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const list = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);

  try {
    const quotes = await fetchQuotes(list);
    const prices: Record<string, number> = {};
    for (const q of quotes) {
      if (q.price > 0) prices[q.symbol] = q.price;
    }

    const missing = list.filter((s) => !prices[s]);
    const unresolved = await fillMissingQuotes(missing, prices, quotes);

    const finnhub = inspectFinnhubKey(process.env.FINNHUB_API_KEY);

    return NextResponse.json({
      quotes,
      prices,
      updatedAt: new Date().toISOString(),
      unresolved,
      providers: {
        yahoo: true,
        finnhub: finnhub.configured && finnhub.valid,
        finnhubHint: finnhub.hint,
        twelveData: Boolean(process.env.TWELVE_DATA_API_KEY),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
