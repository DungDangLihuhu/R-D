import { describe, expect, it } from "vitest";
import {
  annotateTransactions,
  currentUsdRate,
  formatNativeMoney,
  holdingsSnapshotInUsd,
  symbolCurrencies,
  toUsdPrices,
  toUsdTransactions,
  type FxLookup,
} from "./fx";
import { computePortfolioStats } from "./stats";
import type { AppState, Transaction } from "./types";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    portfolioId: "p",
    type: "BUY",
    symbol: "SAN.PA",
    assetType: "STOCK",
    quantity: 10,
    price: 100,
    fee: 0,
    date: "2025-01-02",
    ...partial,
  };
}

const lookup: FxLookup = {
  currencies: { "SAN.PA": "EUR", AAPL: "USD", "VOD.L": "GBp" },
  rates: {
    EUR: {
      current: 1.2,
      points: [
        { date: "2024-12-31", close: 1.04 },
        { date: "2025-01-02", close: 1.1 },
        { date: "2025-06-02", close: 1.15 },
      ],
    },
    GBP: { current: 1.3, points: [{ date: "2025-01-02", close: 1.25 }] },
  },
};

describe("currency units", () => {
  it("converts London pence quotes through pounds", () => {
    expect(currentUsdRate("GBp", { GBP: 1.3 })).toBeCloseTo(0.013);
    expect(formatNativeMoney(124.25, "GBp")).toContain("1,24");
  });
});

describe("annotateTransactions", () => {
  const state: AppState = {
    portfolios: [{ id: "p", name: "Chính", currency: "USD", createdAt: "2025-01-01" }],
    transactions: [
      tx({ id: "a", date: "2025-01-02T14:30:00.000Z" }),
      tx({ id: "b", symbol: "AAPL" }),
      tx({ id: "c", symbol: "CASH", type: "DEPOSIT", quantity: 1, price: 5000 }),
      tx({ id: "d", symbol: "VOD.L", price: 120 }),
    ],
    marketPrices: {},
  };

  it("stores the listing currency and the rate on the trade date", () => {
    const next = annotateTransactions(state, lookup);
    const byId = new Map(next.transactions.map((t) => [t.id, t]));
    expect(byId.get("a")).toMatchObject({ currency: "EUR", fxRate: 1.1 });
    expect(byId.get("b")).toMatchObject({ currency: "USD" });
    expect(byId.get("b")?.fxRate).toBeUndefined();
    expect(byId.get("c")?.currency).toBeUndefined();
    expect(byId.get("d")?.fxRate).toBeCloseTo(0.0125);
    expect(next.fxRates).toEqual({ EUR: 1.2, GBP: 1.3 });
  });

  it("returns the same state once everything is annotated", () => {
    const once = annotateTransactions(state, lookup);
    expect(annotateTransactions(once, lookup)).toBe(once);
  });
});

describe("USD view", () => {
  it("counts cost at the trade-date rate and value at today's rate", () => {
    const trades = [tx({ currency: "EUR", fxRate: 1.1 })];
    const stats = computePortfolioStats(
      toUsdTransactions(trades),
      "p",
      toUsdPrices({ "SAN.PA": 110 }, symbolCurrencies({ transactions: trades }), { EUR: 1.2 })
    );
    // Giá vốn 10 × 100 € × 1,10 = 1.100 $; giá trị 10 × 110 € × 1,20 = 1.320 $.
    expect(stats.holdingsCost).toBeCloseTo(1100);
    expect(stats.holdingsValue).toBeCloseTo(1320);
    expect(stats.unrealizedPnl).toBeCloseTo(220);
  });

  it("books the Snowball holdings deposit in dollars", () => {
    const rows = holdingsSnapshotInUsd(
      [
        { ...tx({ type: "DEPOSIT", symbol: "CASH", quantity: 2000, price: 1, notes: "Snowball Holdings — nạp tự động theo tổng giá vốn" }) },
        tx({ symbol: "SAN.PA", quantity: 10, price: 100 }),
        tx({ symbol: "AAPL", quantity: 5, price: 200 }),
      ],
      lookup
    );
    expect(rows[0].quantity).toBeCloseTo(10 * 100 * 1.2 + 5 * 200);
    expect(rows[1]).toMatchObject({ currency: "EUR", fxRate: 1.2 });
  });
});
