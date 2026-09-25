import { describe, expect, it } from "vitest";
import { computePortfolioStats } from "./stats";
import { findNewOversells, heldQuantityAt } from "./trade-display";
import type { Transaction } from "./types";

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

let seq = 0;
function tx(partial: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    portfolioId: "p",
    type: "BUY",
    symbol: "AAPL",
    assetType: "STOCK",
    quantity: 1,
    price: 1,
    fee: 0,
    date: daysAgo(0),
    ...partial,
  };
}

describe("IRR", () => {
  it("does not count realized profit twice (buy 1,000 → sell 1,100 after a year ≈ 10%)", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "BUY", quantity: 100, price: 10, date: daysAgo(365) }),
        tx({ type: "SELL", quantity: 100, price: 11, date: daysAgo(0) }),
      ],
      "p"
    );
    expect(stats.irr).toBeCloseTo(10, 0);
  });

  it("ignores hidden symbols on both the cash flows and the terminal value", () => {
    const txs = [
      tx({ type: "BUY", symbol: "AAPL", quantity: 10, price: 100, date: daysAgo(365) }),
      tx({ type: "BUY", symbol: "TSLA", quantity: 10, price: 100, date: daysAgo(365) }),
    ];
    const prices = { AAPL: 110, TSLA: 110 };
    const all = computePortfolioStats(txs, "p", prices);
    const hidden = computePortfolioStats(txs, "p", prices, {}, new Set(["TSLA"]));
    expect(hidden.irr).toBeCloseTo(all.irr ?? 0, 0);
    expect(hidden.irr).toBeCloseTo(10, 0);
  });
});

describe("same-day ordering", () => {
  it("processes a buy before a sell stamped with the same date, whatever the input order", () => {
    const day = daysAgo(10);
    const sellFirst = computePortfolioStats(
      [
        tx({ type: "SELL", quantity: 10, price: 110, date: day }),
        tx({ type: "BUY", quantity: 10, price: 100, date: day }),
      ],
      "p"
    );
    expect(sellFirst.realizedPnl).toBeCloseTo(100);
    expect(sellFirst.holdings).toHaveLength(0);
  });
});

describe("total profit %", () => {
  it("is null rather than 0% when every position is closed and no deposits are recorded", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "BUY", quantity: 10, price: 100, date: daysAgo(100) }),
        tx({ type: "SELL", quantity: 10, price: 150, date: daysAgo(10) }),
      ],
      "p"
    );
    expect(stats.totalProfit).toBeCloseTo(500);
    expect(stats.totalProfitPercent).toBeNull();
  });

  it("divides by net deposits when deposits are recorded (Snowball 'All cash movements')", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "DEPOSIT", symbol: "CASH", quantity: 1, price: 30_000, date: daysAgo(300) }),
        tx({ type: "BUY", quantity: 10, price: 100, date: daysAgo(200) }),
      ],
      "p",
      { AAPL: 90 }
    );
    expect(stats.totalProfit).toBeCloseTo(-100);
    expect(stats.totalProfitPercent).toBeCloseTo((-100 / 30_000) * 100);
  });

  it("keeps cost of current holdings as the base when no deposits are recorded", () => {
    const stats = computePortfolioStats(
      [tx({ type: "BUY", quantity: 10, price: 100, date: daysAgo(50) })],
      "p",
      { AAPL: 110 }
    );
    expect(stats.totalProfitPercent).toBeCloseTo(10);
  });
});

describe("profit curve", () => {
  it("does not draw a deposit as profit and ends at totalProfit", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "DEPOSIT", symbol: "CASH", quantity: 1, price: 50_000, date: daysAgo(200) }),
        tx({ type: "BUY", quantity: 10, price: 100, date: daysAgo(100) }),
      ],
      "p",
      { AAPL: 120 }
    );
    expect(stats.profitCurve[0].value).toBeCloseTo(0);
    expect(stats.profitCurve.at(-1)?.value).toBeCloseTo(stats.totalProfit);
    expect(stats.totalProfit).toBeCloseTo(200);
  });
});

describe("splits", () => {
  it("multiplies the shares held and keeps the total cost", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "BUY", symbol: "NVDA", quantity: 10, price: 1000, date: "2024-01-02" }),
        tx({ type: "SPLIT", symbol: "NVDA", quantity: 10, price: 0, date: "2024-06-10" }),
        tx({ type: "SELL", symbol: "NVDA", quantity: 50, price: 120, date: "2024-07-01" }),
      ],
      "p"
    );
    expect(stats.realizedPnl).toBeCloseTo(50 * 120 - 50 * 100);
    expect(stats.holdings[0]).toMatchObject({ symbol: "NVDA", quantity: 50, avgCost: 100 });
  });

  it("applies the split before trades stamped with the same day", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "BUY", symbol: "NVDA", quantity: 5, price: 120, date: "2024-06-10" }),
        tx({ type: "SPLIT", symbol: "NVDA", quantity: 10, price: 0, date: "2024-06-10" }),
        tx({ type: "BUY", symbol: "NVDA", quantity: 10, price: 1000, date: "2024-01-02" }),
      ],
      "p"
    );
    expect(stats.holdings[0].quantity).toBeCloseTo(105);
    expect(stats.holdings[0].totalCost).toBeCloseTo(10_000 + 600);
  });

  it("counts post-split shares when checking for oversells", () => {
    const txs = [
      tx({ type: "BUY", symbol: "NVDA", quantity: 10, price: 1000, date: "2024-01-02" }),
      tx({ type: "SPLIT", symbol: "NVDA", quantity: 10, price: 0, date: "2024-06-10" }),
    ];
    const sell = [tx({ type: "SELL", symbol: "NVDA", quantity: 60, price: 120, date: "2024-07-01" })];
    expect(findNewOversells(txs, sell, "p")).toEqual([]);
    expect(heldQuantityAt(txs, "p", "NVDA", "2024-06-10")).toBe(100);
  });
});

describe("oversell detection", () => {
  const existing = [tx({ type: "BUY", quantity: 10, price: 100, date: "2025-01-02" })];

  it("flags only sells that exceed what is held at that point", () => {
    const incoming = [
      tx({ type: "SELL", quantity: 5, price: 110, date: "2025-02-01" }),
      tx({ type: "SELL", quantity: 8, price: 120, date: "2025-03-01" }),
    ];
    const oversells = findNewOversells(existing, incoming, "p");
    expect(oversells).toEqual([{ symbol: "AAPL", date: "2025-03-01", sold: 8, held: 5 }]);
  });

  it("reports held quantity up to the end of a given day", () => {
    const txs = [...existing, tx({ type: "SELL", quantity: 4, price: 110, date: "2025-02-01" })];
    expect(heldQuantityAt(txs, "p", "AAPL", "2025-01-31")).toBe(10);
    expect(heldQuantityAt(txs, "p", "AAPL", "2025-02-01")).toBe(6);
  });
});

describe("symbolPnl", () => {
  it("adds realized, unrealized and dividends per symbol over all time", () => {
    const stats = computePortfolioStats(
      [
        tx({ type: "BUY", symbol: "AAPL", quantity: 10, price: 100, date: daysAgo(300) }),
        tx({ type: "SELL", symbol: "AAPL", quantity: 5, price: 120, date: daysAgo(200) }),
        tx({ type: "DIVIDEND", symbol: "AAPL", quantity: 5, price: 4, date: daysAgo(100) }),
        tx({ type: "BUY", symbol: "XYZ", quantity: 10, price: 50, date: daysAgo(90) }),
        tx({ type: "BUY", symbol: "OLD", quantity: 4, price: 25, date: daysAgo(400) }),
        tx({ type: "SELL", symbol: "OLD", quantity: 4, price: 20, date: daysAgo(350) }),
      ],
      "p",
      { AAPL: 130, XYZ: 40 }
    );
    const bySymbol = new Map(stats.symbolPnl.map((s) => [s.symbol, s]));
    // AAPL: chốt 5 × 20 = 100, đang giữ 5 × (130 − 100) = 150, cổ tức 20.
    expect(bySymbol.get("AAPL")).toMatchObject({ realized: 100, unrealized: 150, dividends: 20, total: 270, invested: 1000, open: true });
    expect(bySymbol.get("AAPL")?.percent).toBeCloseTo(27, 8);
    expect(bySymbol.get("XYZ")).toMatchObject({ total: -100, open: true });
    expect(bySymbol.get("OLD")).toMatchObject({ total: -20, open: false });
    expect(stats.symbolPnl.map((s) => s.symbol)).toEqual(["AAPL", "OLD", "XYZ"]);
  });
});
