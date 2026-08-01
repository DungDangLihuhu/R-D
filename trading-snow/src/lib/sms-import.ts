import type { AssetType, Transaction, TransactionType } from "./types";
import { toYahooSymbol } from "./symbol";

export interface ParsedSmsTrade {
  broker: string;
  type: TransactionType;
  symbol: string;
  quantity: number;
  price: number;
  ref?: string;
  raw: string;
}

export interface SmsParseResult {
  trades: ParsedSmsTrade[];
  errors: string[];
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNum(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseStanChartFilled(text: string): ParsedSmsTrade | null {
  const sideMatch = text.match(
    /order\s+filled:\s*(buy|sell)\s+([\d,.]+)\s+shares?\s+of\s+([A-Z0-9.-]+)/i
  );
  if (!sideMatch) return null;

  const [, side, qtyRaw, symbol] = sideMatch;
  const quantity = parseNum(qtyRaw);
  if (quantity <= 0) return null;

  const avgMatch = text.match(/avg\.?\s*filled\s+price:\s*([\d,.]+)/i);
  const atMatch = text.match(/at\s+USD\s+([\d,.]+)/i);
  const price = parseNum(avgMatch?.[1] ?? atMatch?.[1] ?? "0");
  if (price <= 0) return null;

  const refMatch = text.match(/ref\.?\s*([A-Z0-9]+)/i);
  const exchangeMatch = text.match(/\bon\s+([A-Z0-9.-]+)\s+at\b/i);

  return {
    broker: "StanChart",
    type: side.toLowerCase() === "sell" ? "SELL" : "BUY",
    symbol: toYahooSymbol(symbol, exchangeMatch?.[1]),
    quantity,
    price,
    ref: refMatch?.[1],
    raw: text,
  };
}

const PARSERS: { name: string; match: RegExp; parse: (text: string) => ParsedSmsTrade | null }[] = [
  {
    name: "StanChart",
    match: /stanchart|order\s+filled:/i,
    parse: parseStanChartFilled,
  },
];

function splitMessages(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const parts = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (parts.length > 1) return parts.map(normalize);

  const filledChunks = normalized.split(/(?=StanChart:\s*Order filled:)/i);
  if (filledChunks.length > 1) {
    return filledChunks.map((c) => normalize(c)).filter(Boolean);
  }

  return [normalize(normalized)];
}

export function parseBankSms(text: string): SmsParseResult {
  const messages = splitMessages(text);
  const trades: ParsedSmsTrade[] = [];
  const errors: string[] = [];

  if (messages.length === 0) {
    return { trades: [], errors: ["Chưa có nội dung tin nhắn"] };
  }

  for (const msg of messages) {
    let parsed: ParsedSmsTrade | null = null;

    for (const p of PARSERS) {
      if (!p.match.test(msg)) continue;
      parsed = p.parse(msg);
      if (parsed) break;
    }

    if (parsed) {
      trades.push(parsed);
    } else {
      const preview = msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
      errors.push(`Không nhận diện được: "${preview}"`);
    }
  }

  return { trades, errors };
}

export function smsTradesToTransactions(
  trades: ParsedSmsTrade[],
  portfolioId: string,
  assetType: AssetType = "STOCK",
  date = new Date().toISOString()
): Omit<Transaction, "id">[] {
  return trades.map((t) => ({
    portfolioId,
    type: t.type,
    symbol: t.symbol,
    assetType,
    quantity: t.quantity,
    price: t.price,
    fee: 0,
    date,
    notes: [
      t.broker,
      t.ref ? `Ref ${t.ref}` : null,
      "SMS import",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}
