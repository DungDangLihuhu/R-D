import { describe, expect, it } from "vitest";
import type { WyckoffResult } from "./indicators/ben-dang/types";
import {
  BUY_PRICE_BAND,
  isValidLongLevels,
  isWithinBuyPriceBand,
  wyckoffBuyHit,
} from "./signals";

function result(overrides: Partial<WyckoffResult> = {}): WyckoffResult {
  return {
    phase: "accumulation",
    phaseLabel: "Tích lũy — Phase C (Spring)",
    events: [],
    confidence: { score: 75, level: "high", label: "Cao" },
    warnings: [],
    summary: {
      trend: "test",
      volumePattern: "test",
      recommendation: "test",
    },
    tradingRange: {
      top: 110,
      bottom: 100,
      creek: 110,
      ice: 100,
      kind: "accumulation",
      topTouches: 2,
      bottomTouches: 3,
      startIndex: 10,
      endIndex: 40,
    },
    entry: {
      price: 100,
      stop: 95,
      action: "buy",
      label: "Sau Spring, trên Ice",
      reason: "Spring thành công",
    },
    ...overrides,
  };
}

describe("isWithinBuyPriceBand", () => {
  it("includes prices inside ±5% of the buy level", () => {
    expect(isWithinBuyPriceBand(100, 100)).toBe(true);
    expect(isWithinBuyPriceBand(105, 100)).toBe(true);
    expect(isWithinBuyPriceBand(95, 100)).toBe(true);
    expect(isWithinBuyPriceBand(100 * (1 + BUY_PRICE_BAND), 100)).toBe(true);
  });

  it("excludes prices outside ±5%", () => {
    expect(isWithinBuyPriceBand(105.1, 100)).toBe(false);
    expect(isWithinBuyPriceBand(94.9, 100)).toBe(false);
  });

  it("rejects invalid prices", () => {
    expect(isWithinBuyPriceBand(0, 100)).toBe(false);
    expect(isWithinBuyPriceBand(100, 0)).toBe(false);
  });
});

describe("wyckoffBuyHit", () => {
  it("returns a hit when market is within the buy band", () => {
    const hit = wyckoffBuyHit(result(), 102, "1d");
    expect(hit?.entryAction).toBe("buy");
    expect(hit?.distPct).toBeCloseTo(2, 5);
    expect(hit?.entryPrice).toBe(100);
  });

  it("keeps wait entries at the ±5% band edge when still above the stop", () => {
    const wait = result({
      confidence: { score: 50, level: "medium", label: "Trung bình" },
      entry: {
        price: 100,
        stop: 90,
        action: "wait",
        label: "LPS",
        reason: "Chờ giá về mốc",
      },
    });
    expect(wyckoffBuyHit(wait, 105, "1d")?.entryAction).toBe("wait");
    expect(wyckoffBuyHit(wait, 95, "4h")?.entryAction).toBe("wait");
    expect(wyckoffBuyHit(wait, 105.1, "1d")).toBeNull();
  });

  it("keeps wait entries if price has reached the buy level", () => {
    const hit = wyckoffBuyHit(
      result({
        confidence: { score: 50, level: "medium", label: "Trung bình" },
        entry: {
          price: 100,
          stop: 95,
          action: "wait",
          label: "LPS",
          reason: "Chờ giá về mốc",
        },
      }),
      98,
      "1d"
    );
    expect(hit?.entryAction).toBe("wait");
    expect(hit?.distPct).toBeCloseTo(-2, 5);
  });

  it("ignores distribution avoid levels", () => {
    expect(
      wyckoffBuyHit(
        result({
          phase: "distribution",
          entry: {
            price: 100,
            stop: 95,
            action: "avoid",
            label: "Ice (chờ Spring)",
            reason: "Không mua gần Creek",
          },
        }),
        100,
        "1d"
      )
    ).toBeNull();
  });

  it("ignores setups with no entry or with price too far from the buy level", () => {
    expect(wyckoffBuyHit(result({ entry: undefined }), 100, "1d")).toBeNull();
    expect(wyckoffBuyHit(result(), 112, "1d")).toBeNull();
  });

  it("ignores longs whose stop sits at or above the entry", () => {
    expect(
      wyckoffBuyHit(
        result({
          entry: {
            price: 100,
            stop: 102,
            action: "buy",
            label: "ST / gần Ice",
            reason: "ST dưới Ice nhưng cắt lỗ vẫn neo Ice",
          },
        }),
        100,
        "1d"
      )
    ).toBeNull();
  });

  it("ignores longs that have already broken the stop", () => {
    expect(
      wyckoffBuyHit(
        result({
          entry: {
            price: 100,
            stop: 97,
            action: "wait",
            label: "LPS",
            reason: "Giá đã thủng cắt lỗ",
          },
        }),
        96.5,
        "1d"
      )
    ).toBeNull();
  });
});

describe("isValidLongLevels", () => {
  it("requires stop below entry and market still above the stop", () => {
    expect(isValidLongLevels(100, 95, 100)).toBe(true);
    expect(isValidLongLevels(100, 100, 100)).toBe(false);
    expect(isValidLongLevels(48.5, 49.82, 48.5)).toBe(false);
    expect(isValidLongLevels(100, 97, 96.9)).toBe(false);
    expect(isValidLongLevels(100, null, 100)).toBe(true);
  });
});
