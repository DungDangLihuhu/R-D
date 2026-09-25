import { describe, expect, it } from "vitest";
import { transactionsToCsv } from "./csv-export";
import { csvRowsToTransactions, parseBrokerCsv } from "./csv-import";
import type { Transaction } from "./types";

const base = { portfolioId: "p", assetType: "STOCK" as const, fee: 0 };
const trades: Transaction[] = [
  { ...base, id: "1", type: "DEPOSIT", symbol: "CASH", assetType: "OTHER", quantity: 1, price: 50000, date: "2024-01-02T15:00:00.000Z" },
  { ...base, id: "2", type: "BUY", symbol: "AAPL", quantity: 50, price: 185.5, fee: 1, date: "2024-01-10T15:00:00.000Z", notes: 'Mua "đợt 1", thử' },
  { ...base, id: "3", type: "BUY", symbol: "SAN.PA", quantity: 30, price: 88.5, date: "2024-09-12T15:00:00.000Z", currency: "EUR", fxRate: 1.1 },
  { ...base, id: "4", type: "SPLIT", symbol: "NVDA", quantity: 10, price: 0, date: "2024-06-10T15:00:00.000Z" },
  { ...base, id: "5", type: "DIVIDEND", symbol: "KO", quantity: 100, price: 0.485, date: "2024-07-01T15:00:00.000Z" },
];

describe("transactionsToCsv", () => {
  it("round-trips through the Snowball importer", () => {
    const parsed = parseBrokerCsv(transactionsToCsv(trades));
    expect(parsed.errors).toEqual([]);
    expect(parsed.format).toBe("snowball_transactions");
    const back = csvRowsToTransactions(parsed.rows, "p");
    const key = (t: Omit<Transaction, "id">) =>
      [t.type, t.symbol, t.quantity, t.price, t.fee, t.date.slice(0, 10), t.currency ?? ""].join("|");
    expect(back.map(key).sort()).toEqual(
      trades.map((t) => key({ ...t, currency: t.symbol === "CASH" ? undefined : t.currency })).sort()
    );
    expect(back.find((t) => t.symbol === "AAPL")?.notes).toBe('Mua "đợt 1", thử');
  });
});
