import { describe, expect, it } from "vitest";
import { buildBenchmarkComparison, buildTwrGrowth, resolveBenchmarkWindow } from "./benchmark";
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

  it("treats each buy as money in and each sale as money out, like a Snowball import", () => {
    const history = {
      AAA: [
        { date: "2025-01-02", close: 100 },
        { date: "2025-01-03", close: 120 },
      ],
      BBB: [
        { date: "2025-01-06", close: 50 },
        { date: "2025-01-07", close: 55 },
      ],
    };
    const trades = [
      trade({ id: "a1", symbol: "AAA", quantity: 10, price: 100, date: "2025-01-02" }),
      trade({ id: "a2", symbol: "AAA", type: "SELL", quantity: 10, price: 120, date: "2025-01-03" }),
      // Đã bán hết, rồi mở vị thế mới lớn gấp mười bằng tiền "nạp" mới.
      trade({ id: "b1", symbol: "BBB", quantity: 200, price: 50, date: "2025-01-06" }),
    ];
    const result = buildTwrGrowth(trades, { BBB: 55 }, history);
    // +20% ở AAA, đứng yên khi không cầm mã nào, rồi +10% ở BBB — không phụ thuộc số tiền.
    expect(result.dates).toEqual(["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"]);
    expect(result.growth).toEqual([
      expect.closeTo(1, 8),
      expect.closeTo(1.2, 8),
      expect.closeTo(1.2, 8),
      expect.closeTo(1.32, 8),
    ]);

    // Lệnh nạp/rút tiền và lãi tiền mặt không phải lợi nhuận của phần cổ phiếu.
    const cash = (partial: Partial<Transaction>) =>
      trade({ symbol: "CASH", quantity: 1000, price: 1, ...partial });
    const withCash = buildTwrGrowth(
      [
        cash({ id: "c1", type: "DEPOSIT", date: "2025-01-02" }),
        ...trades,
        cash({ id: "c2", type: "WITHDRAW", date: "2025-01-03" }),
        cash({ id: "c3", type: "DIVIDEND", quantity: 50, date: "2025-01-07" }),
      ],
      { BBB: 55 },
      history
    );
    expect(withCash.growth.at(-1)).toBeCloseTo(1.32, 8);
  });
});

describe("benchmark windows", () => {
  const firstTrade = { ...buy, date: "2021-04-05T00:00:00.000Z" };
  // 6 giờ sáng giờ máy: theo UTC vẫn là hôm trước, nhưng ngày của người dùng là 27/9.
  const now = new Date(2026, 8, 27, 6, 0);
  const from = (range: Parameters<typeof resolveBenchmarkWindow>[1], at = now, txs = [firstTrade]) =>
    resolveBenchmarkWindow([], range, at, txs);

  it("measures each range from the close on or before its start date", () => {
    expect(from("ytd")).toEqual({ from: "2025-12-31", to: "2026-09-27", clampedToHistory: false });
    expect(from("1y")?.from).toBe("2025-09-27");
    expect(from("5y")?.from).toBe("2021-09-27");
    // 31/8 lùi 6 tháng là 28/2, không tràn sang 3/3.
    expect(from("6m", new Date(2026, 7, 31))?.from).toBe("2026-02-28");
    // "Tất cả": từ phiên trước lệnh đầu tiên, để gồm cả lãi/lỗ của ngày mua đầu.
    expect(from("all")).toMatchObject({ from: "2021-04-04", clampedToHistory: false });
  });

  it("starts at the first trade when the range is longer than the portfolio", () => {
    const young = [{ ...buy, date: "2023-01-10T00:00:00.000Z" }];
    expect(from("5y", now, young)).toMatchObject({ from: "2023-01-09", clampedToHistory: true });
  });
});

describe("benchmark period base", () => {
  const held = { ...buy, date: "2024-06-03T00:00:00.000Z" };
  const closes = [
    { date: "2024-06-03", close: 100 },
    { date: "2025-09-26", close: 100 },
    { date: "2025-12-31", close: 100 },
    { date: "2026-01-02", close: 102 },
    { date: "2026-06-01", close: 110 },
  ];
  const spyTr = [
    { date: "2025-09-26", close: 480 },
    { date: "2025-12-31", close: 500 },
    { date: "2026-01-02", close: 510 },
    { date: "2026-06-01", close: 550 },
  ];

  it("counts the first session of the year in YTD", () => {
    const result = buildBenchmarkComparison(
      { transactions: [held], marketPrices: {}, priceHistory: { XYZ: closes } },
      spyTr,
      { from: "2025-12-31", to: "2026-06-01" },
      "ytd"
    );
    // Gốc là giá đóng cửa 31/12, không phải phiên 2/1 (cách cũ bỏ mất +2% và +2% của 2/1).
    expect(result?.from).toBe("2025-12-31");
    expect(result?.sp500Return).toBeCloseTo(10, 8);
    expect(result?.portfolioReturn).toBeCloseTo(10, 8);
  });

  it("uses the last close before a start date that falls on a weekend", () => {
    const result = buildBenchmarkComparison(
      { transactions: [held], marketPrices: {}, priceHistory: { XYZ: closes } },
      spyTr,
      { from: "2025-09-27", to: "2026-06-01" },
      "1y"
    );
    expect(result?.from).toBe("2025-09-26");
    expect(result?.sp500Return).toBeCloseTo((550 / 480 - 1) * 100, 8);
  });

  it("includes the first day's gain since inception and starts the S&P the session before", () => {
    const first = { ...buy, date: "2026-01-02T00:00:00.000Z" };
    const history = { XYZ: [{ date: "2026-01-02", close: 105 }, { date: "2026-06-01", close: 110 }] };
    const all = buildBenchmarkComparison(
      { transactions: [first], marketPrices: {}, priceHistory: history },
      spyTr,
      { from: "2026-01-01", to: "2026-06-01" },
      "all"
    );
    // Mua 100, đóng cửa 105 ngay hôm đó rồi 110: +10% tính từ giá mua.
    expect(all).toMatchObject({ from: "2025-12-31", clampedToHistory: false });
    expect(all?.points[0]).toMatchObject({ portfolio: 100, sp500: 100 });
    expect(all?.portfolioReturn).toBeCloseTo(10, 8);
    expect(all?.sp500Return).toBeCloseTo(10, 8);

    // Khung 1 năm dài hơn danh mục (vd. có lệnh nạp tiền từ trước): S&P cũng chỉ tính từ
    // phiên trước lệnh mua đầu tiên, không cộng thêm quãng danh mục chưa có cổ phiếu.
    const year = buildBenchmarkComparison(
      { transactions: [first], marketPrices: {}, priceHistory: history },
      spyTr,
      { from: "2025-06-01", to: "2026-06-01" },
      "1y"
    );
    expect(year).toMatchObject({ from: "2025-12-31", clampedToHistory: true });
    expect(year?.sp500Return).toBeCloseTo(10, 8);
    expect(year?.portfolioReturn).toBeCloseTo(10, 8);
  });
});
