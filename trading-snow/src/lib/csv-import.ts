import type { AssetType, Transaction, TransactionType } from "./types";

export type CsvFormat = "auto" | "generic" | "ibkr" | "tradingview";

export interface CsvRow {
  date: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  notes?: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
  format: CsvFormat;
}

const TYPE_MAP: Record<string, TransactionType> = {
  buy: "BUY",
  b: "BUY",
  mua: "BUY",
  sell: "SELL",
  s: "SELL",
  bán: "SELL",
  ban: "SELL",
  dividend: "DIVIDEND",
  div: "DIVIDEND",
  "cổ tức": "DIVIDEND",
  deposit: "DEPOSIT",
  withdraw: "WITHDRAW",
  withdrawal: "WITHDRAW",
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectFormat(headers: string[]): CsvFormat {
  const h = headers.map(normHeader);
  if (h.includes("tradedate") || h.includes("ibcommission")) return "ibkr";
  if (h.includes("ticker") && h.includes("side")) return "tradingview";
  return "generic";
}

function colIndex(headers: string[], ...candidates: string[]): number {
  const normed = headers.map(normHeader);
  for (const c of candidates) {
    const i = normed.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
  // MM/DD/YYYY or DD/MM/YYYY — assume MM/DD for US brokers
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`).toISOString();
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseType(raw: string): TransactionType | null {
  const key = raw.trim().toLowerCase();
  if (TYPE_MAP[key]) return TYPE_MAP[key];
  if (key.includes("buy")) return "BUY";
  if (key.includes("sell")) return "SELL";
  if (key.includes("div")) return "DIVIDEND";
  return null;
}

function parseNum(raw: string): number {
  const n = parseFloat(raw.replace(/[,$]/g, ""));
  return isNaN(n) ? 0 : Math.abs(n);
}

export function parseBrokerCsv(
  text: string,
  format: CsvFormat = "auto"
): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errors: string[] = [];
  if (lines.length < 2) {
    return { rows: [], errors: ["File CSV cần ít nhất header + 1 dòng"], format: "generic" };
  }

  const headers = parseCsvLine(lines[0]);
  const detected = format === "auto" ? detectFormat(headers) : format;

  const iDate = colIndex(headers, "date", "tradedate", "datetime", "time");
  const iSymbol = colIndex(headers, "symbol", "ticker", "instrument");
  const iType = colIndex(headers, "type", "side", "action", "buysell", "transactiontype");
  const iQty = colIndex(headers, "quantity", "qty", "shares", "amount");
  const iPrice = colIndex(headers, "price", "tradeprice", "fillprice", "avgprice");
  const iFee = colIndex(headers, "fee", "commission", "ibcommission", "fees");

  if (iDate < 0 || iSymbol < 0 || iType < 0 || iQty < 0 || iPrice < 0) {
    return {
      rows: [],
      errors: [
        "Không map được cột. Cần: date, symbol, type/side, quantity, price. Tùy chọn: fee",
      ],
      format: detected,
    };
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;

    const date = parseDate(cols[iDate] ?? "");
    const symbol = (cols[iSymbol] ?? "").toUpperCase().replace(/\s/g, "");
    const type = parseType(cols[iType] ?? "");
    const quantity = parseNum(cols[iQty] ?? "0");
    const price = parseNum(cols[iPrice] ?? "0");
    const fee = iFee >= 0 ? parseNum(cols[iFee] ?? "0") : 0;

    if (!date) {
      errors.push(`Dòng ${i + 1}: ngày không hợp lệ`);
      continue;
    }
    if (!symbol) {
      errors.push(`Dòng ${i + 1}: thiếu mã`);
      continue;
    }
    if (!type) {
      errors.push(`Dòng ${i + 1}: loại không nhận diện (${cols[iType]})`);
      continue;
    }
    if (quantity <= 0 || price <= 0) {
      errors.push(`Dòng ${i + 1}: quantity/price phải > 0`);
      continue;
    }

    rows.push({ date, symbol, type, quantity, price, fee });
  }

  return { rows, errors, format: detected };
}

export function csvRowsToTransactions(
  rows: CsvRow[],
  portfolioId: string,
  assetType: AssetType = "STOCK"
): Omit<Transaction, "id">[] {
  return rows.map((r) => ({
    portfolioId,
    type: r.type,
    symbol: r.symbol,
    assetType,
    quantity: r.quantity,
    price: r.price,
    fee: r.fee,
    date: r.date,
    notes: r.notes ? `CSV: ${r.notes}` : "Import CSV",
  }));
}
