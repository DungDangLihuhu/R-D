import { describe, expect, it } from "vitest";
import {
  buildMarketProfitCurve,
  pickCloseSeries,
  unadjustForSplits,
} from "./price-history";
import type { Transaction } from "./types";
import type { CloseHistory } from "./yahoo";

let seq = 0;
function tx(partial: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    portfolioId: "p",
    type: "BUY",
    symbol: "NVDA",
    assetType: "STOCK",
    quantity: 1,
    price: 1,
    fee: 0,
    date: "2024-06-03",
    ...partial,
  };
}

// Yahoo trả giá đã chia cho split 10:1 ngày 10/06/2024.
const NVDA: CloseHistory = {
  points: [
    { date: "2024-06-03", close: 115 },
    { date: "2024-06-07", close: 120 },
    { date: "2024-06-10", close: 121 },
    { date: "2024-06-14", close: 131 },
  ],
  splits: [{ date: "2024-06-10", ratio: 10 }],
};

describe("unadjustForSplits", () => {
  it("multiplies closes before the split back to the price that actually traded", () => {
    expect(unadjustForSplits(NVDA.points, NVDA.splits).map((p) => p.close)).toEqual([
      1150, 1200, 121, 131,
    ]);
  });
});

describe("pickCloseSeries", () => {
  it("uses actual prices when trades before the split were recorded at the traded price", () => {
    const series = pickCloseSeries(NVDA, [tx({ price: 1148, date: "2024-06-03" })]);
    expect(series[0].close).toBe(1150);
  });

  it("keeps split-adjusted prices when trades were recorded the way brokers restate them", () => {
    const series = pickCloseSeries(NVDA, [tx({ price: 114.8, date: "2024-06-03" })]);
    expect(series[0].close).toBe(115);
  });
});

describe("buildMarketProfitCurve", () => {
  const now = new Date("2024-06-20T12:00:00Z");

  it("values holdings at each session's close and ignores deposits", () => {
    const txs = [
      tx({ type: "DEPOSIT", symbol: "CASH", quantity: 1, price: 5000, date: "2024-06-03" }),
      tx({ type: "BUY", symbol: "MSFT", quantity: 10, price: 100, fee: 1, date: "2024-06-03" }),
    ];
    const series = {
      MSFT: [
        { date: "2024-06-03", close: 100 },
        { date: "2024-06-07", close: 110 },
        { date: "2024-06-14", close: 120 },
      ],
    };
    const curve = buildMarketProfitCurve(txs, series, 250, now);
    expect(curve?.map((p) => p.value)).toEqual([-1, 99, 199, 250]);
    expect(curve?.at(-1)?.date).toBe(now.toISOString());
  });

  it("keeps the position value continuous across a recorded split", () => {
    const txs = [
      tx({ type: "BUY", quantity: 1, price: 1150, date: "2024-06-03" }),
      tx({ type: "SPLIT", quantity: 10, price: 0, date: "2024-06-10" }),
    ];
    const series = { NVDA: pickCloseSeries(NVDA, txs) };
    const curve = buildMarketProfitCurve(txs, series, 160, now);
    // 1 cổ × 1.200 trước split, 10 cổ × 121 sau split — không có cú rơi 10 lần.
    expect(curve?.map((p) => p.value)).toEqual([0, 50, 60, 160, 160]);
  });

  it("returns null when there is nothing to value", () => {
    const txs = [tx({ type: "DEPOSIT", symbol: "CASH", quantity: 1, price: 100 })];
    expect(buildMarketProfitCurve(txs, {}, 0, now)).toBeNull();
  });
});
