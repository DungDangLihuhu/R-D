import { describe, expect, it } from "vitest";
import { buildBenchmarkComparison, buildTwrGrowth } from "./benchmark";
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
    // Theo thời gian: giá trị 1.400 đầu kỳ → 1.500 cuối kỳ = +7,14% (cách cũ chia cho giá
    // vốn 1.000 ra 10%).
    expect(result?.method).toBe("twr");
    expect(result?.portfolioReturn).toBeCloseTo((150 / 140 - 1) * 100, 6);
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

describe("buildTwrGrowth", () => {
  const trade = (partial: Partial<Transaction>): Transaction => ({ ...buy, ...partial });

  it("ignores how much money went in and when", () => {
    const history = {
      XYZ: [
        { date: "2025-01-02", close: 100 },
        { date: "2025-01-03", close: 110 },
        { date: "2025-01-06", close: 121 },
      ],
    };
    const small = buildTwrGrowth(
      [trade({ id: "a", date: "2025-01-02" })],
      { XYZ: 121 },
      history
    );
    const topUp = buildTwrGrowth(
      [
        trade({ id: "a", date: "2025-01-02" }),
        // Tiền mua coi như vào đầu ngày (như Portfolio Performance): lệnh khớp ở giá đầu
        // ngày 100 thì cả ngày tăng lên 110 được tính.
        trade({ id: "b", quantity: 1000, price: 100, date: "2025-01-03" }),
      ],
      { XYZ: 121 },
      history
    );
    // Cổ phiếu tăng 21% trong kỳ; mua thêm nhiều ở giữa kỳ không làm đổi con số đó.
    expect(small.growth.at(-1)).toBeCloseTo(1.21, 8);
    expect(topUp.growth.at(-1)).toBeCloseTo(1.21, 8);
  });

  it("counts dividends and sale proceeds as part of the return", () => {
    const history = {
      XYZ: [
        { date: "2025-01-02", close: 100 },
        { date: "2025-01-03", close: 100 },
        { date: "2025-01-06", close: 100 },
      ],
    };
    const result = buildTwrGrowth(
      [
        trade({ id: "a", date: "2025-01-02" }),
        trade({ id: "d", type: "DIVIDEND", quantity: 10, price: 1, date: "2025-01-03" }),
        trade({ id: "s", type: "SELL", quantity: 10, price: 105, date: "2025-01-06" }),
      ],
      {},
      history
    );
    // +1% cổ tức, rồi bán ở 105 khi giá đóng cửa hôm trước là 100: +5%.
    expect(result.growth.at(-1)).toBeCloseTo(1.01 * 1.05, 8);
  });
});
