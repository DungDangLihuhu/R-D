import { describe, expect, it } from "vitest";
import { sanitizeAppState } from "./sanitize-state";

const good = {
  id: "t1",
  portfolioId: "p",
  type: "BUY",
  symbol: "AAPL",
  assetType: "STOCK",
  quantity: 10,
  price: 100,
  fee: 1,
  date: "2025-01-02",
};

describe("sanitizeAppState", () => {
  it("rejects data that is not an app state at all", () => {
    expect(sanitizeAppState(null)).toBeNull();
    expect(sanitizeAppState({ transactions: [] })).toBeNull();
  });

  it("drops trades with missing or wrongly typed fields instead of crashing later", () => {
    const result = sanitizeAppState({
      portfolios: [{ id: "p", name: "Chính" }],
      transactions: [
        good,
        { ...good, id: "t2", date: undefined },
        { ...good, id: "t3", quantity: "abc" },
        { ...good, id: "t4", type: "TRANSFER" },
        { ...good, id: "t1" },
      ],
      marketPrices: { AAPL: 190, BAD: "x" },
    });
    expect(result?.state.transactions.map((t) => t.id)).toEqual(["t1"]);
    expect(result?.dropped).toBe(4);
    expect(result?.state.marketPrices).toEqual({ AAPL: 190 });
  });

  it("keeps splits, whose price is zero by design", () => {
    const split = { ...good, id: "s1", type: "SPLIT", quantity: 10, price: 0, fee: 0 };
    const result = sanitizeAppState({ portfolios: [{ id: "p", name: "Chính" }], transactions: [split] });
    expect(result?.state.transactions).toHaveLength(1);
  });

  it("falls back to a default portfolio when none is usable", () => {
    const result = sanitizeAppState({ portfolios: [{}], transactions: [] });
    expect(result?.state.portfolios[0].id).toBe("default");
  });
});

describe("quotes", () => {
  it("keeps the regular-session move needed for the day's change after hours", () => {
    const result = sanitizeAppState({
      portfolios: [{ id: "p", name: "Chính" }],
      transactions: [],
      marketQuotes: {
        AAPL: { price: 336.94, change: -0.08, changePercent: -0.02, marketSession: "post", regularChange: -2.72, regularChangePercent: -0.8 },
      },
    });
    expect(result?.state.marketQuotes?.AAPL).toMatchObject({ regularChange: -2.72, regularChangePercent: -0.8 });
  });
});
