import { NextRequest, NextResponse } from "next/server";
import {
  getFinnhubApiKey,
  getTwelveDataApiKey,
  inspectFinnhubKey,
  inspectTwelveDataKey,
  testFinnhubKey,
} from "@/lib/quote-config";
import {
  fetchQuotesForSymbols,
  QUOTE_BATCH_SIZE,
  QUOTE_MAX_SYMBOLS,
} from "@/lib/quote-providers";
import { fetchQuoteFinnhubOne, fetchQuotes } from "@/lib/yahoo";
import { currencyUnit } from "@/lib/fx";
import { fxSeries, mapLimited } from "@/lib/fx-server";

/** Tỷ giá hiện tại ra USD cho các đồng tiền niêm yết của những mã vừa lấy giá. */
async function currentFxRates(currencies: (string | undefined)[]): Promise<Record<string, number>> {
  const bases = [
    ...new Set(currencies.map((c) => currencyUnit(c).base).filter((b) => b !== "USD")),
  ];
  if (bases.length === 0) return {};
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const series = await mapLimited(bases, 3, (b) => fxSeries(b, from));
  const fx: Record<string, number> = {};
  bases.forEach((b, i) => {
    const current = series[i]?.current;
    if (current && current > 0) fx[b] = current;
  });
  return fx;
}

async function runQuoteCheck() {
  const finnhubKey = getFinnhubApiKey();
  const finnhub = inspectFinnhubKey(finnhubKey);
  const twelveData = inspectTwelveDataKey();

  const yahooTest = await fetchQuotes(["AAPL", "BNP.PA", "UPRO"]);
  const yahooOk = yahooTest.length > 0;

  let finnhubTest: { ok: boolean; price?: number; error?: string } | null = null;
  let finnhubPaTest: { ok: boolean; error?: string } | null = null;

  if (finnhubKey && finnhub.valid) {
    finnhubTest = await testFinnhubKey(finnhubKey);
    const pa = await fetchQuoteFinnhubOne("BNP.PA", finnhubKey);
    finnhubPaTest = pa
      ? { ok: true }
      : {
          ok: false,
          error:
            "Finnhub free không hỗ trợ .PA — dùng Yahoo (đã tích hợp sẵn, không cần key).",
        };
  } else if (finnhub.configured) {
    finnhubTest = { ok: false, error: finnhub.hint };
  }

  return {
    yahoo: {
      ok: yahooOk,
      samples: yahooTest.map((q) => ({ symbol: q.symbol, price: q.price, source: q.source })),
    },
    finnhub,
    finnhubTest,
    finnhubPaTest,
    twelveData,
    limits: {
      batchSize: QUOTE_BATCH_SIZE,
      maxSymbols: QUOTE_MAX_SYMBOLS,
      note: "App tự chia batch — không phải giới hạn Yahoo 50 mã",
    },
    steps: [
      "1. Key Finnhub lấy tại https://finnhub.io/dashboard (copy nguyên chuỗi từ dashboard)",
      "2. Vercel env: FINNHUB_API_KEY = key Finnhub (Production + Preview)",
      "3. Redeploy sau khi đổi env",
      "4. US stocks: Yahoo hoặc Finnhub. Cổ phiếu .PA: chỉ Yahoo (Finnhub free không có)",
      "5. Bấm Refresh giá trên Danh mục",
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
    .filter(Boolean);

  try {
    const result = await fetchQuotesForSymbols(list);
    const finnhub = inspectFinnhubKey();
    const fx = await currentFxRates(result.quotes.map((q) => q.currency));

    return NextResponse.json({
      quotes: result.quotes,
      prices: result.prices,
      fx,
      updatedAt: new Date().toISOString(),
      unresolved: result.unresolved,
      requested: result.requested,
      truncated: result.truncated,
      providers: {
        yahoo: true,
        finnhub: finnhub.configured && finnhub.valid,
        finnhubHint: finnhub.hint,
        twelveData: Boolean(getTwelveDataApiKey()),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
