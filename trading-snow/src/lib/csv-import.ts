import type { AssetType, Transaction, TransactionType } from "./types";
import { toYahooSymbol } from "./symbol";

export type CsvFormat =
  | "auto"
  | "generic"
  | "ibkr"
  | "tradingview"
  | "snowball_holdings"
  | "snowball_transactions";

export interface CsvRow {
  date: string;
  symbol: string;
  type: TransactionType;
  quantity: number;
  price: number;
  fee: number;
  notes?: string;
  /** Tiền tệ của giá theo file (cột Currency của Snowball); không có thì app tự tra theo mã. */
  currency?: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
  format: CsvFormat;
  marketPrices?: Record<string, number>;
  info?: string;
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
  cash_in: "DEPOSIT",
  cash_out: "WITHDRAW",
};

const SNOWBALL_EVENT_MAP: Record<string, TransactionType | null> = {
  buy: "BUY",
  sell: "SELL",
  dividend: "DIVIDEND",
  stock_as_dividend: "DIVIDEND",
  cash_in: "DEPOSIT",
  cash_out: "WITHDRAW",
  cash_gain: "DEPOSIT",
  cash_expense: "WITHDRAW",
  fee: null,
  split: null,
  spinoff: null,
  cash_convert: null,
};

type Delimiter = "," | ";" | "\t";

/**
 * Đoán dấu phân cách từ dòng tiêu đề. Chỉ tách theo đúng một dấu — tách cả `,` lẫn `;`
 * sẽ cắt đôi số có dấu phẩy thập phân (`189,50`) trong file Excel xuất ở máy Việt Nam.
 */
function detectDelimiter(headerLine: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

function parseCsvLine(line: string, delimiter: Delimiter): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
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
  if (h.includes("holding") && h.includes("shares") && h.includes("costpershare")) {
    return "snowball_holdings";
  }
  if (h.includes("event") && h.includes("symbol") && h.includes("quantity")) {
    return "snowball_transactions";
  }
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

type DateOrder = "mdy" | "dmy";

const NUMERIC_DATE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/;

/**
 * Broker Mỹ ghi m/d/y, file tự làm ở Việt Nam thường là d/m/y. Chỉ cần một dòng có
 * số đầu > 12 (hoặc số giữa > 12) là biết cả file; không phân biệt được thì giữ m/d/y.
 */
function detectDateOrder(
  lines: string[],
  iDate: number,
  delimiter: Delimiter
): DateOrder {
  for (let i = 1; i < lines.length; i++) {
    const match = (parseCsvLine(lines[i], delimiter)[iDate] ?? "").trim().match(NUMERIC_DATE);
    if (!match) continue;
    if (Number(match[1]) > 12) return "dmy";
    if (Number(match[2]) > 12) return "mdy";
  }
  return "mdy";
}

function toIso(date: Date): string | null {
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDate(raw: string, order: DateOrder = "mdy"): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return toIso(new Date(s));
  const numeric = s.match(NUMERIC_DATE);
  if (numeric) {
    const [, first, second, y] = numeric;
    const [m, d] = order === "dmy" ? [second, first] : [first, second];
    return toIso(new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`));
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  // Ngày dạng chữ không có giờ ("Jan 5, 2024") được JS đọc theo giờ địa phương; lấy
  // đúng ngày lịch để UTC+7 không đẩy lùi sang hôm trước.
  if (!/\d{1,2}:\d{2}/.test(s)) {
    return new Date(
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    ).toISOString();
  }
  return parsed.toISOString();
}

function parseType(raw: string): TransactionType | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (TYPE_MAP[key]) return TYPE_MAP[key];
  if (SNOWBALL_EVENT_MAP[key] !== undefined) return SNOWBALL_EVENT_MAP[key];
  if (key.includes("buy")) return "BUY";
  if (key.includes("sell")) return "SELL";
  if (key.includes("div")) return "DIVIDEND";
  return null;
}

/**
 * Chấp nhận cả `1,234.56` lẫn `1.234,56` và `189,50`. Có cả hai dấu thì dấu đứng sau
 * là dấu thập phân; chỉ có dấu phẩy thì `1,234` / `12,345,678` là phân tách nghìn,
 * còn `189,50` / `1,5` là dấu phẩy thập phân.
 */
function parseNum(raw: string): number {
  let s = String(raw).replace(/[\s$€ ]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const commas = s.split(",").length - 1;
    const decimals = s.length - lastComma - 1;
    s = commas === 1 && decimals !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function resolveSymbol(
  cols: string[],
  headers: string[],
  symbolCol: number,
  extra?: { exchangeCol?: number; countryCol?: number }
): string {
  const ticker = cols[symbolCol] ?? "";
  const iExchange =
    extra?.exchangeCol ??
    colIndex(headers, "exchange", "market", "mic", "primaryexchange", "listingexchange");
  const iCountry = extra?.countryCol ?? colIndex(headers, "country", "nation", "region");
  const exchange = iExchange >= 0 ? cols[iExchange] : undefined;
  const country = iCountry >= 0 ? cols[iCountry] : undefined;
  return toYahooSymbol(ticker, exchange, country);
}

function parseSnowballHoldings(
  headers: string[],
  lines: string[],
  delimiter: Delimiter
): CsvParseResult {
  const iSymbol = colIndex(headers, "holding");
  const iQty = colIndex(headers, "shares");
  const iCost = colIndex(headers, "costpershare");
  const iMarket = colIndex(headers, "shareprice");
  const iName = colIndex(headers, "holdingsname");
  const iCountry = colIndex(headers, "country");
  const iExchange = colIndex(headers, "exchange", "market");

  const errors: string[] = [];
  const rows: CsvRow[] = [];
  const marketPrices: Record<string, number> = {};
  const importDate = new Date().toISOString();

  if (iSymbol < 0 || iQty < 0 || iCost < 0) {
    return {
      rows: [],
      errors: ["Snowball Holdings: thiếu cột Holding, Shares hoặc Cost per share"],
      format: "snowball_holdings",
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.every((c) => !c)) continue;

    const symbol = resolveSymbol(cols, headers, iSymbol, {
      exchangeCol: iExchange,
      countryCol: iCountry,
    });
    const quantity = parseNum(cols[iQty] ?? "0");
    const price = parseNum(cols[iCost] ?? "0");
    const name = iName >= 0 ? cols[iName] : "";

    if (!symbol) {
      errors.push(`Dòng ${i + 1}: thiếu mã`);
      continue;
    }
    if (quantity <= 0) continue;
    if (price <= 0) {
      errors.push(`Dòng ${i + 1} (${symbol}): Cost per share không hợp lệ`);
      continue;
    }

    if (iMarket >= 0) {
      const mp = parseNum(cols[iMarket] ?? "0");
      if (mp > 0) marketPrices[symbol] = mp;
    }

    rows.push({
      date: importDate,
      symbol,
      type: "BUY",
      quantity,
      price,
      fee: 0,
      notes: name ? `Snowball: ${name}` : "Snowball Holdings import",
    });
  }

  const totalCost = rows.reduce((sum, r) => sum + r.quantity * r.price, 0);
  if (totalCost > 0) {
    rows.unshift({
      date: importDate,
      symbol: "CASH",
      type: "DEPOSIT",
      quantity: totalCost,
      price: 1,
      fee: 0,
      notes: "Snowball Holdings — nạp tự động theo tổng giá vốn",
    });
  }

  return {
    rows,
    errors,
    format: "snowball_holdings",
    marketPrices,
    info:
      "File Holdings Snowball — mã quốc tế hóa theo Country/Exchange (vd. SAN + France → SAN.PA). Tự thêm nạp tiền = tổng giá vốn. Để import lịch sử giao dịch, xuất Transactions từ Snowball.",
  };
}

function parseSnowballTransactions(
  headers: string[],
  lines: string[],
  delimiter: Delimiter
): CsvParseResult {
  const iEvent = colIndex(headers, "event");
  const iDate = colIndex(headers, "date");
  const iSymbol = colIndex(headers, "symbol");
  const iPrice = colIndex(headers, "price");
  const iQty = colIndex(headers, "quantity");
  const iFee = colIndex(headers, "feetax", "feetax", "fee");
  const iCountry = colIndex(headers, "country");
  const iExchange = colIndex(headers, "exchange", "market");
  const iCurrency = colIndex(headers, "currency");

  const errors: string[] = [];
  const rows: CsvRow[] = [];

  if (iEvent < 0 || iDate < 0 || iPrice < 0 || iQty < 0) {
    return {
      rows: [],
      errors: ["Snowball Transactions: thiếu cột Event, Date, Price hoặc Quantity"],
      format: "snowball_transactions",
    };
  }

  const dateOrder = detectDateOrder(lines, iDate, delimiter);

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.every((c) => !c)) continue;

    const eventRaw = (cols[iEvent] ?? "").trim();
    const date = parseDate(cols[iDate] ?? "", dateOrder);
    const symbol =
      iSymbol >= 0
        ? resolveSymbol(cols, headers, iSymbol, {
            exchangeCol: iExchange,
            countryCol: iCountry,
          })
        : "";

    // Snowball ghi split với Price = hệ số (AAPL 4 đổi 1 → 4), Quantity = số cổ nhận
    // được — chỉ cần hệ số, số cổ sau split tự tính từ vị thế đang giữ.
    if (eventRaw.toLowerCase() === "split") {
      const ratio = parseNum(cols[iPrice] ?? "0");
      if (!date || !symbol || !(ratio > 0) || ratio === 1) {
        errors.push(
          `Dòng ${i + 1}: split${symbol ? ` ${symbol}` : ""} thiếu ngày/mã hoặc hệ số (cột Price) không hợp lệ`
        );
        continue;
      }
      rows.push({
        date,
        symbol,
        type: "SPLIT",
        quantity: ratio,
        price: 0,
        fee: 0,
        notes: `Snowball: ${eventRaw}`,
      });
      continue;
    }

    const type = parseType(eventRaw);
    if (type === null) {
      if (eventRaw) errors.push(`Dòng ${i + 1}: bỏ qua event "${eventRaw}"`);
      continue;
    }
    const quantity = parseNum(cols[iQty] ?? "0");
    const price = parseNum(cols[iPrice] ?? "0");
    const fee = iFee >= 0 ? parseNum(cols[iFee] ?? "0") : 0;

    const isCash = type === "DEPOSIT" || type === "WITHDRAW";

    if (!date) {
      errors.push(`Dòng ${i + 1}: ngày không hợp lệ`);
      continue;
    }
    if (!isCash && !symbol) {
      errors.push(`Dòng ${i + 1}: thiếu Symbol`);
      continue;
    }
    if (quantity <= 0 || price <= 0) {
      errors.push(`Dòng ${i + 1}: quantity/price phải > 0`);
      continue;
    }

    const currency = iCurrency >= 0 ? cols[iCurrency]?.trim() : "";
    rows.push({
      date,
      symbol: isCash ? "CASH" : symbol,
      type,
      quantity,
      price,
      fee,
      notes: `Snowball: ${eventRaw}`,
      ...(!isCash && currency ? { currency } : {}),
    });
  }

  return { rows, errors, format: "snowball_transactions" };
}

function parseGenericTransactions(
  headers: string[],
  lines: string[],
  format: CsvFormat,
  delimiter: Delimiter
): CsvParseResult {
  const iDate = colIndex(headers, "date", "tradedate", "datetime", "time");
  const iSymbol = colIndex(headers, "symbol", "ticker", "instrument", "holding");
  const iType = colIndex(
    headers,
    "type",
    "side",
    "action",
    "buysell",
    "transactiontype",
    "event"
  );
  const iQty = colIndex(headers, "quantity", "qty", "shares", "amount");
  const iPrice = colIndex(
    headers,
    "price",
    "tradeprice",
    "fillprice",
    "avgprice",
    "costpershare"
  );
  const iFee = colIndex(headers, "fee", "commission", "ibcommission", "fees", "feetax");
  const iExchange = colIndex(
    headers,
    "exchange",
    "market",
    "mic",
    "primaryexchange",
    "listingexchange"
  );
  const iCountry = colIndex(headers, "country", "nation", "region");

  const errors: string[] = [];

  if (iDate < 0 || iSymbol < 0 || iType < 0 || iQty < 0 || iPrice < 0) {
    return {
      rows: [],
      errors: [
        "Không map được cột. Cần: date, symbol, type/side, quantity, price. Tùy chọn: fee, exchange, country. Hoặc dùng export Holdings/Transactions từ Snowball.",
      ],
      format,
    };
  }

  const rows: CsvRow[] = [];
  const dateOrder = detectDateOrder(lines, iDate, delimiter);

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delimiter);
    if (cols.every((c) => !c)) continue;

    const date = parseDate(cols[iDate] ?? "", dateOrder);
    const symbol = resolveSymbol(cols, headers, iSymbol, {
      exchangeCol: iExchange,
      countryCol: iCountry,
    });
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

  return { rows, errors, format };
}

export function parseBrokerCsv(
  text: string,
  format: CsvFormat = "auto"
): CsvParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ["File CSV cần ít nhất header + 1 dòng"],
      format: "generic",
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const detected = format === "auto" ? detectFormat(headers) : format;

  if (detected === "snowball_holdings") {
    return parseSnowballHoldings(headers, lines, delimiter);
  }
  if (detected === "snowball_transactions") {
    return parseSnowballTransactions(headers, lines, delimiter);
  }

  return parseGenericTransactions(headers, lines, detected, delimiter);
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
    notes: r.notes ? r.notes : "Import CSV",
    ...(r.currency ? { currency: r.currency } : {}),
  }));
}
