import { formatMoney } from "./format";
import type { AppState, MarketQuote, Transaction } from "./types";
import type { HistoryPoint } from "./yahoo";

/**
 * Mọi số liệu danh mục hiển thị bằng USD. Giá vốn của mã niêm yết ngoại tệ quy đổi theo
 * tỷ giá ngày giao dịch (đúng số USD thật sự bỏ ra), giá trị hiện tại theo tỷ giá hôm
 * nay — nên lãi/lỗ đã gồm cả phần chênh tỷ giá, như Snowball tính.
 */

/** Yahoo niêm yết vài sàn bằng đơn vị lẻ: GBp (penny, London), ZAc (cent, Johannesburg), ILA (agora, Tel Aviv). */
const MINOR_UNITS: Record<string, { base: string; factor: number }> = {
  GBp: { base: "GBP", factor: 0.01 },
  GBX: { base: "GBP", factor: 0.01 },
  ZAc: { base: "ZAR", factor: 0.01 },
  ZAC: { base: "ZAR", factor: 0.01 },
  ILA: { base: "ILS", factor: 0.01 },
};

export function currencyUnit(currency?: string | null): { base: string; factor: number } {
  if (!currency) return { base: "USD", factor: 1 };
  return MINOR_UNITS[currency] ?? { base: currency.toUpperCase(), factor: 1 };
}

/** Số tiền theo tiền tệ niêm yết, đổi đơn vị lẻ ra đơn vị chính: 124,25 GBp → £1,24. */
export function formatNativeMoney(amount: number, currency?: string | null): string {
  const { base, factor } = currencyUnit(currency);
  return formatMoney(amount * factor, base);
}

export function isUsdCurrency(currency?: string | null): boolean {
  const { base, factor } = currencyUnit(currency);
  return base === "USD" && factor === 1;
}

/** Số USD cho 1 đơn vị giá niêm yết bằng `currency` theo tỷ giá hiện tại; null khi chưa có tỷ giá. */
export function currentUsdRate(
  currency: string | undefined,
  fxRates: Record<string, number> | undefined
): number | null {
  const { base, factor } = currencyUnit(currency);
  if (base === "USD") return factor;
  const rate = fxRates?.[base];
  return rate && rate > 0 ? rate * factor : null;
}

/** Tỷ giá quy đổi giá của một lệnh: tỷ giá ngày giao dịch đã lưu, chưa có thì tạm dùng tỷ giá hiện tại. */
export function transactionUsdRate(tx: Transaction, fxRates?: Record<string, number>): number {
  if (!tx.currency || isUsdCurrency(tx.currency)) return 1;
  if (tx.fxRate && tx.fxRate > 0) return tx.fxRate;
  return currentUsdRate(tx.currency, fxRates) ?? 1;
}

/** Bản USD của các lệnh để mọi phép tính (thống kê, IRR, biểu đồ) chạy trên một đồng tiền. */
export function toUsdTransactions(
  transactions: Transaction[],
  fxRates?: Record<string, number>
): Transaction[] {
  return transactions.map((tx) => {
    const rate = transactionUsdRate(tx, fxRates);
    return rate === 1 ? tx : { ...tx, price: tx.price * rate, fee: tx.fee * rate };
  });
}

/** Tiền tệ niêm yết của từng mã: theo giá Yahoo mới nhất, chưa có thì theo lệnh đã ghi. */
export function symbolCurrencies(
  state: Pick<AppState, "transactions" | "marketQuotes">
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tx of state.transactions) {
    if (tx.currency && tx.symbol !== "CASH") map[tx.symbol] = tx.currency;
  }
  for (const [symbol, quote] of Object.entries(state.marketQuotes ?? {})) {
    if (quote.currency) map[symbol] = quote.currency;
  }
  return map;
}

export function toUsdPrices(
  prices: Record<string, number>,
  currencies: Record<string, string>,
  fxRates?: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [symbol, price] of Object.entries(prices)) {
    const rate = currentUsdRate(currencies[symbol], fxRates);
    out[symbol] = rate == null ? price : price * rate;
  }
  return out;
}

export function toUsdQuotes(
  quotes: Record<string, MarketQuote>,
  currencies: Record<string, string>,
  fxRates?: Record<string, number>
): Record<string, MarketQuote> {
  const out: Record<string, MarketQuote> = {};
  for (const [symbol, quote] of Object.entries(quotes)) {
    const rate = currentUsdRate(quote.currency ?? currencies[symbol], fxRates);
    out[symbol] =
      rate == null || rate === 1
        ? quote
        : { ...quote, price: quote.price * rate, change: quote.change * rate };
  }
  return out;
}

export function rateOnOrBefore(points: HistoryPoint[] | undefined, day: string): number | null {
  if (!points || points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].date <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Lệnh trước ngày đầu tiên có tỷ giá (hiếm): dùng tỷ giá gần nhất phía sau.
  return points[Math.max(found, 0)].close;
}

export interface FxSeries {
  current: number;
  points: HistoryPoint[];
}

export interface FxLookup {
  /** Mã → tiền tệ niêm yết. */
  currencies: Record<string, string>;
  /** Tiền (EUR, GBP…) → số USD cho 1 đơn vị theo ngày. */
  rates: Record<string, FxSeries>;
}

/**
 * Import Snowball Holdings ghi lệnh mua theo giá vốn bình quân bằng tiền niêm yết, kèm khoản
 * nạp tự thêm = tổng giá vốn. Quy các lệnh đó ra USD theo tỷ giá hôm nay (ngày import) để
 * khoản nạp không cộng lẫn EUR với USD.
 */
export function holdingsSnapshotInUsd<T extends Omit<Transaction, "id">>(
  transactions: T[],
  lookup: FxLookup
): T[] {
  let totalUsd = 0;
  const converted = transactions.map((tx) => {
    if (tx.type !== "BUY") return tx;
    const currency = tx.currency ?? lookup.currencies[tx.symbol.toUpperCase()] ?? "USD";
    const { base, factor } = currencyUnit(currency);
    const current = lookup.rates[base]?.current;
    const rate = base === "USD" ? factor : current ? current * factor : null;
    if (rate == null) {
      totalUsd += tx.quantity * tx.price;
      return tx;
    }
    totalUsd += tx.quantity * tx.price * rate;
    return isUsdCurrency(currency) ? { ...tx, currency } : { ...tx, currency, fxRate: rate };
  });
  return converted.map((tx) =>
    tx.type === "DEPOSIT" && tx.notes?.startsWith("Snowball Holdings")
      ? { ...tx, quantity: totalUsd }
      : tx
  );
}

/** Lệnh của mã (không phải tiền mặt) còn thiếu tiền tệ, hoặc là ngoại tệ mà thiếu tỷ giá ngày giao dịch. */
export function needsFxAnnotation(tx: Transaction): boolean {
  if (tx.symbol === "CASH") return false;
  if (!tx.currency) return true;
  return !isUsdCurrency(tx.currency) && !(tx.fxRate && tx.fxRate > 0);
}

/** Ghi tiền tệ và tỷ giá ngày giao dịch vào các lệnh còn thiếu; trả nguyên `state` nếu không đổi gì. */
export function annotateTransactions(state: AppState, lookup: FxLookup): AppState {
  let changed = false;

  const transactions = state.transactions.map((tx) => {
    if (!needsFxAnnotation(tx)) return tx;
    const currency = tx.currency ?? lookup.currencies[tx.symbol.toUpperCase()];
    if (!currency) return tx;
    if (isUsdCurrency(currency)) {
      changed = true;
      return { ...tx, currency };
    }
    const { base, factor } = currencyUnit(currency);
    const rate = rateOnOrBefore(lookup.rates[base]?.points, tx.date.slice(0, 10));
    if (rate == null) {
      if (tx.currency === currency) return tx;
      changed = true;
      return { ...tx, currency };
    }
    changed = true;
    return { ...tx, currency, fxRate: rate * factor };
  });

  const fxRates = { ...(state.fxRates ?? {}) };
  for (const [base, series] of Object.entries(lookup.rates)) {
    if (series.current > 0 && fxRates[base] !== series.current) {
      fxRates[base] = series.current;
      changed = true;
    }
  }

  return changed ? { ...state, transactions, fxRates } : state;
}
