import { describe, expect, it } from "vitest";
import {
  ANALYST_TARGET_WINDOW_SEC,
  INDUSTRY_SELL_PREMIUM,
  industryValuationSell,
  summarizeAnalystTargets,
  summarizeIndustryMultiples,
} from "./analyst-targets";
import { computeBuySellPrices } from "./stock-assessment";
import type { PriceLevels } from "./stock-analysis";

function levels(partial: Partial<PriceLevels> = {}): PriceLevels {
  return {
    support: [{ price: 90, label: "Hỗ trợ 1" }],
    resistance: [{ price: 120, label: "Kháng cự 1" }],
    ...partial,
  };
}

describe("summarizeAnalystTargets", () => {
  const now = 1_800_000_000;

  it("averages the latest target per firm inside 90 days", () => {
    const summary = summarizeAnalystTargets(
      100,
      [
        { epochGradeDate: now - 10 * 86400, firm: "JP Morgan", currentPriceTarget: 130 },
        { epochGradeDate: now - 5 * 86400, firm: "JP Morgan", currentPriceTarget: 140 },
        { epochGradeDate: now - 20 * 86400, firm: "Goldman", currentPriceTarget: 120 },
        { epochGradeDate: now - 200 * 86400, firm: "Old Shop", currentPriceTarget: 200 },
      ],
      125,
      now
    );
    expect(summary?.source).toBe("3m");
    expect(summary?.firmCount).toBe(2);
    expect(summary?.price).toBeCloseTo(130, 5);
    expect(summary?.label).toContain("2 hãng");
  });

  it("falls back to consensus when fewer than two dated targets exist", () => {
    const summary = summarizeAnalystTargets(
      100,
      [{ epochGradeDate: now - 10 * 86400, firm: "Only", currentPriceTarget: 118 }],
      122,
      now
    );
    expect(summary?.source).toBe("consensus");
    expect(summary?.price).toBe(122);
  });

  it("ignores targets far outside a sane band", () => {
    expect(
      summarizeAnalystTargets(
        100,
        [
          { epochGradeDate: now - 3 * 86400, firm: "A", currentPriceTarget: 8 },
          { epochGradeDate: now - 3 * 86400, firm: "B", currentPriceTarget: 400 },
        ],
        undefined,
        now
      )
    ).toBeNull();
  });

  it("uses a 90-day window", () => {
    expect(ANALYST_TARGET_WINDOW_SEC).toBe(90 * 24 * 3600);
  });
});

describe("industryValuationSell", () => {
  it("uses EPS × sector forward P/E with a premium", () => {
    const industry = summarizeIndustryMultiples([
      { forwardPe: 18, trailingPe: 20 },
      { forwardPe: 22, trailingPe: 24 },
      { forwardPe: 20, trailingPe: 21 },
    ]);
    expect(industry?.medianForwardPe).toBe(20);
    const anchor = industryValuationSell(100, { epsTTM: 5 }, industry);
    expect(anchor?.price).toBeCloseTo(5 * 20 * INDUSTRY_SELL_PREMIUM, 5);
    expect(anchor?.label).toContain("P/E fwd ngành 20×");
  });

  it("skips when EPS is missing", () => {
    expect(
      industryValuationSell(100, {}, { medianForwardPe: 18, peerCount: 4 })
    ).toBeNull();
  });
});

describe("computeBuySellPrices sell blend", () => {
  it("blends resistance, 3-month analyst target, and industry valuation", () => {
    const { sellPrice, sellNote } = computeBuySellPrices(
      100,
      levels(),
      undefined,
      { epsTTM: 5, peTTM: 20 },
      undefined,
      {
        analystTarget: {
          price: 130,
          firmCount: 8,
          source: "3m",
          label: "PT CTCK 3 tháng (8 hãng)",
        },
        industry: { medianForwardPe: 20, peerCount: 4 },
      }
    );
    const industrySell = 5 * 20 * INDUSTRY_SELL_PREMIUM;
    const expected = (120 * 1 + 130 * 1.25 + industrySell * 1) / (1 + 1.25 + 1);
    expect(sellPrice).toBeCloseTo(expected, 5);
    expect(sellNote).toContain("Kháng cự 1");
    expect(sellNote).toContain("PT CTCK 3 tháng");
    expect(sellNote).toContain("P/E fwd ngành");
  });

  it("does not crush the sell level to a tiny bounce when PEG 2.0 is already below spot", () => {
    const { sellPrice, sellNote } = computeBuySellPrices(
      100,
      levels({ resistance: [{ price: 118, label: "Kháng cự 1" }] }),
      undefined,
      { epsTTM: 2, epsGrowthTTMYoy: 10, peTTM: 50 },
      2.5,
      {
        analystTarget: {
          price: 125,
          firmCount: 6,
          source: "3m",
          label: "PT CTCK 3 tháng (6 hãng)",
        },
      }
    );
    expect(sellPrice).toBeGreaterThan(110);
    expect(sellNote).not.toContain("đã trên mốc bán cơ bản");
    expect(sellNote).toContain("PT CTCK 3 tháng");
  });

  it("caps the sell near resistance when price is already at the 3-month target", () => {
    const { sellPrice, sellNote } = computeBuySellPrices(
      100,
      levels({ resistance: [{ price: 108, label: "Kháng cự 1" }] }),
      undefined,
      { epsTTM: 5 },
      undefined,
      {
        analystTarget: {
          price: 99,
          firmCount: 5,
          source: "3m",
          label: "PT CTCK 3 tháng (5 hãng)",
        },
      }
    );
    expect(sellPrice).toBeLessThanOrEqual(108);
    expect(sellNote).toContain("giá ≥ PT CTCK 3 tháng");
  });
});
