import { describe, expect, it } from "vitest";
import { buildBenchmarkComparison } from "./benchmark";
import type { Transaction } from "./types";

const buy: Transaction = {
  id: "b1",
  portfolioId: "p",
  type: "BUY",
  symbol: "XYZ",
  assetType: "STOCK",
  quantity: 10,
  price: 100,
  fee: 0,
  date: "2024-01-02",
};

const spy = [
  { date: "2025-01-02", close: 500 },
  { date: "2025-06-02", close: 550 },
];
const window = { from: "2025-01-02", to: "2025-06-02" };

describe("benchmark period return", () => {
  it("counts only the gain made inside the window when closes are known", () => {
    const result = buildBenchmarkComparison(
      {
        transactions: [buy],
        marketPrices: { XYZ: 150 },
        priceHistory: {
          XYZ: [
            { date: "2024-01-02", close: 100 },
            { date: "2025-01-02", close: 140 },
            { date: "2025-06-02", close: 150 },
          ],
        },
      },
      spy,
      window,
      "1y"
    );
    // Giá vốn 1.000: float 400 đầu kỳ → 500 cuối kỳ, trong kỳ lãi 100 = 10%.
    expect(result?.portfolioReturn).toBeCloseTo(10);
  });

  it("falls back to the last trade price, putting all earlier gain into the window", () => {
    const result = buildBenchmarkComparison(
      { transactions: [buy], marketPrices: { XYZ: 150 } },
      spy,
      window,
      "1y"
    );
    expect(result?.portfolioReturn).toBeCloseTo(50);
  });
});
