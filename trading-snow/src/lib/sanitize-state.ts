import type {
  AppState,
  AssetType,
  MarketQuote,
  MarketSession,
  Portfolio,
  Transaction,
  TransactionType,
} from "./types";

const TRANSACTION_TYPES: readonly TransactionType[] = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAW",
  "SPLIT",
];
const ASSET_TYPES: readonly AssetType[] = ["STOCK", "ETF", "CRYPTO", "FOREX", "OTHER"];
const SESSIONS: readonly MarketSession[] = ["pre", "regular", "post", "closed"];

function finite(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function validDate(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function sanitizeTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const type = TRANSACTION_TYPES.find((t) => t === r.type);
  const id = text(r.id);
  const portfolioId = text(r.portfolioId);
  const symbol = text(r.symbol)?.trim();
  const date = validDate(r.date);
  const quantity = finite(r.quantity);
  const price = finite(r.price);
  const fee = r.fee == null ? 0 : finite(r.fee);

  if (!type || !id || !portfolioId || !symbol || !date) return null;
  if (quantity == null || price == null || fee == null) return null;
  // Split ghi hệ số vào quantity và giá 0; mọi loại khác cần số lượng và giá dương.
  if (quantity <= 0 || price < 0 || fee < 0 || (type !== "SPLIT" && price === 0)) return null;

  const tx: Transaction = {
    id,
    portfolioId,
    type,
    symbol,
    assetType: ASSET_TYPES.find((a) => a === r.assetType) ?? "STOCK",
    quantity,
    price,
    fee,
    date,
  };
  const notes = text(r.notes);
  if (notes) tx.notes = notes;
  const currency = text(r.currency);
  if (currency) tx.currency = currency;
  const fxRate = finite(r.fxRate);
  if (fxRate != null && fxRate > 0) tx.fxRate = fxRate;
  return tx;
}

function sanitizePortfolio(raw: unknown): Portfolio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id);
  const name = text(r.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    currency: text(r.currency) ?? "USD",
    createdAt: validDate(r.createdAt) ?? new Date(0).toISOString(),
  };
}

function sanitizeQuote(raw: unknown): MarketQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const price = finite(r.price);
  if (price == null) return null;
  const quote: MarketQuote = {
    price,
    change: finite(r.change) ?? 0,
    changePercent: finite(r.changePercent) ?? 0,
  };
  const name = text(r.name);
  if (name) quote.name = name;
  const logo = text(r.logo);
  if (logo) quote.logo = logo;
  const session = SESSIONS.find((s) => s === r.marketSession);
  if (session) quote.marketSession = session;
  const currency = text(r.currency);
  if (currency) quote.currency = currency;
  const regularChange = finite(r.regularChange);
  if (regularChange != null) quote.regularChange = regularChange;
  const regularChangePercent = finite(r.regularChangePercent);
  if (regularChangePercent != null) quote.regularChangePercent = regularChangePercent;
  return quote;
}

function numberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const n = finite(value);
    if (n != null && n > 0) out[key] = n;
  }
  return out;
}

/**
 * Chuẩn hóa state đọc từ localStorage, file hay cloud: bỏ lệnh/portfolio thiếu trường
 * hoặc sai kiểu (một lệnh hỏng đủ làm trắng cả app), bỏ lệnh trùng id. Trả null khi
 * không nhận ra được cấu trúc.
 */
export function sanitizeAppState(raw: unknown): { state: AppState; dropped: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.portfolios) || !Array.isArray(r.transactions)) return null;

  const seenPortfolios = new Set<string>();
  const portfolios = r.portfolios
    .map(sanitizePortfolio)
    .filter((p): p is Portfolio => {
      if (!p || seenPortfolios.has(p.id)) return false;
      seenPortfolios.add(p.id);
      return true;
    });
  if (portfolios.length === 0) {
    portfolios.push({
      id: "default",
      name: "Portfolio chính",
      currency: "USD",
      createdAt: new Date().toISOString(),
    });
  }

  const seenTransactions = new Set<string>();
  const transactions = r.transactions
    .map(sanitizeTransaction)
    .filter((t): t is Transaction => {
      if (!t || seenTransactions.has(t.id)) return false;
      seenTransactions.add(t.id);
      return true;
    });

  const marketQuotes: Record<string, MarketQuote> = {};
  if (r.marketQuotes && typeof r.marketQuotes === "object") {
    for (const [symbol, value] of Object.entries(r.marketQuotes)) {
      const quote = sanitizeQuote(value);
      if (quote) marketQuotes[symbol] = quote;
    }
  }

  const hiddenSymbols: Record<string, string[]> = {};
  if (r.hiddenSymbols && typeof r.hiddenSymbols === "object") {
    for (const [portfolioId, list] of Object.entries(r.hiddenSymbols)) {
      if (!Array.isArray(list)) continue;
      const symbols = list.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      if (symbols.length > 0) hiddenSymbols[portfolioId] = symbols;
    }
  }

  const state: AppState = {
    portfolios,
    transactions,
    marketPrices: numberRecord(r.marketPrices),
    marketQuotes,
    pricesUpdatedAt: validDate(r.pricesUpdatedAt),
    hiddenSymbols,
    fxRates: numberRecord(r.fxRates),
  };

  return { state, dropped: r.transactions.length - transactions.length };
}
