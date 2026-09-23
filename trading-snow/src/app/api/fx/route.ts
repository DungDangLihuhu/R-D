import { NextRequest, NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-response";
import { currencyUnit, type FxSeries } from "@/lib/fx";
import { fxSeries, listingCurrency, mapLimited } from "@/lib/fx-server";

const MAX_SYMBOLS = 40;
const MAX_CURRENCIES = 10;
const DAY_MS = 86_400_000;

/**
 * Tiền tệ niêm yết của các mã (`symbols`) và tỷ giá ra USD theo ngày từ `from` tới hôm
 * nay cho các đồng tiền đó cùng `currencies`. Không có `from` thì chỉ lấy tuần gần nhất.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const list = (name: string, max: number) =>
    [
      ...new Set(
        (params.get(name) ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s && s.toUpperCase() !== "CASH")
      ),
    ].slice(0, max);

  const symbols = list("symbols", MAX_SYMBOLS).map((s) => s.toUpperCase());
  const requested = list("currencies", MAX_CURRENCIES);
  const fromParam = params.get("from");
  if (fromParam && !/^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    return NextResponse.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  const from = fromParam ?? new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);

  const resolved = await mapLimited(symbols, 5, (s) => listingCurrency(s));
  const currencies: Record<string, string> = {};
  symbols.forEach((s, i) => {
    const currency = resolved[i];
    if (currency) currencies[s] = currency;
  });

  const bases = [
    ...new Set(
      [...requested, ...Object.values(currencies)]
        .map((c) => currencyUnit(c).base)
        .filter((b) => b !== "USD")
    ),
  ].slice(0, MAX_CURRENCIES);

  const series = await mapLimited(bases, 3, (b) => fxSeries(b, from));
  const rates: Record<string, FxSeries> = {};
  bases.forEach((b, i) => {
    const s = series[i];
    if (s) rates[b] = s;
  });

  return jsonCached({ currencies, rates }, 1800, 3600);
}
