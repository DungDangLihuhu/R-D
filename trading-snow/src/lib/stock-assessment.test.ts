import { describe, expect, it } from "vitest";
import {
  ANALYST_TARGET_WINDOW_SEC,
  INDUSTRY_SELL_PREMIUM,
  industryValuationSell,
  summarizeAnalystTargets,
  summarizeIndustryMultiples,
} from "./analyst-targets";
import { computeBuySellPrices, computeStockAssessment } from "./stock-assessment";
import type { EarningsRow, InsiderRow, PriceLevels } from "./stock-analysis";

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

describe("computeBuySellPrices growth units", () => {
  it("treats EPS growth as a percent on both sides of 1%", () => {
    const note = (growth: number) =>
      computeBuySellPrices(100, levels(), undefined, { epsTTM: 5, epsGrowthTTMYoy: growth }).buyNote;
    // Trước đây 1,00% bị nhân 100 lần thành 100% và bị chấm "rẻ", còn 1,01% thì không.
    expect(note(1)).not.toContain("rẻ vs định giá");
    expect(note(1)).toBe(note(1.01));
  });
});

function assess(partial: Partial<Parameters<typeof computeStockAssessment>[0]> = {}) {
  return computeStockAssessment({
    price: 100,
    metrics: {},
    news: [],
    insiderTransactions: [],
    recommendations: [],
    priceLevels: levels(),
    ...partial,
  });
}

function signal(result: ReturnType<typeof assess>, id: string) {
  return result.signals.find((s) => s.id === id)!;
}

const DAY = 86_400_000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

function quarters(surprises: number[], latestAgeDays = 400): EarningsRow[] {
  return surprises.map((surprisePercent, i) => ({
    period: isoDaysAgo(latestAgeDays + i * 91),
    estimate: 1,
    actual: 1 + surprisePercent / 100,
    surprisePercent,
  }));
}

describe("earnings signal calibration", () => {
  it("treats three beats in four quarters at a typical +5% as neutral", () => {
    const score = signal(assess({ earningsHistory: quarters([6, 5, -1, 9]) }), "earnings").score;
    expect(Math.abs(score)).toBeLessThan(0.05);
  });

  it("rewards beating every quarter by a wide margin", () => {
    expect(signal(assess({ earningsHistory: quarters([15, 12, 14, 11]) }), "earnings").score).toBeGreaterThan(0.4);
  });

  it("does not let a near-zero estimate blow up the average", () => {
    const detail = signal(assess({ earningsHistory: quarters([900, 5, 5, 5]) }), "earnings").detail;
    expect(detail).toContain("TB +16,3%");
  });

  it("weighs a freshly reported miss", () => {
    const stale = signal(assess({ earningsHistory: quarters([-10, 8, 8, 8]) }), "earnings").score;
    const fresh = signal(assess({ earningsHistory: quarters([-10, 8, 8, 8], 40) }), "earnings");
    expect(fresh.score).toBeLessThan(stale);
    expect(fresh.detail).toContain("quý gần nhất -10,0%");
  });
});

describe("technical signal calibration", () => {
  const trendUp = Array.from({ length: 252 }, (_, i) => ({ close: 50 * 1.004 ** i }));

  it("no longer marks a strong uptrend down for high RSI", () => {
    const result = assess({ priceHistory: trendUp });
    expect(signal(result, "technical").detail).not.toContain("quá mua");
    expect(result.buyNote).not.toContain("quá mua");
  });

  it("scores six-month momentum", () => {
    const flat = Array.from({ length: 252 }, () => ({ close: 100 }));
    const up = signal(assess({ priceHistory: trendUp }), "technical");
    expect(up.score).toBeGreaterThan(signal(assess({ priceHistory: flat }), "technical").score);
    expect(up.detail).toMatch(/6 tháng \+\d+%/);
  });
});

describe("valuation and insider calibration", () => {
  it("leaves the 52-week range out of valuation", () => {
    const detail = signal(
      assess({ metrics: { peTTM: 20, "52WeekHigh": 101, "52WeekLow": 60 } }),
      "valuation"
    ).detail;
    expect(detail).not.toContain("52w");
  });

  it("reads a sub-1% short interest as a small number, not 96%", () => {
    const result = assess({ metrics: { peTTM: 20 }, shortPercentOfFloat: 0.0096 });
    expect(signal(result, "valuation").detail).not.toContain("short");
    const heavy = assess({ metrics: { peTTM: 20 }, shortPercentOfFloat: 0.25 });
    expect(signal(heavy, "valuation").detail).toContain("short 25,0%");
  });

  it("adds a bonus when several insiders buy on the open market", () => {
    const buy = (name: string): InsiderRow => ({
      name,
      date: isoDaysAgo(10),
      change: 1000,
      shares: 5000,
      transactionCode: "P",
      transactionPrice: 50,
      amount: 50_000,
    });
    const one = signal(assess({ insiderTransactions: [buy("A"), buy("A")] }), "insider");
    const three = signal(assess({ insiderTransactions: [buy("A"), buy("B"), buy("C")] }), "insider");
    expect(three.score).toBeGreaterThan(one.score);
    expect(three.detail).toContain("3 người mua trên sàn");
  });

  it("does not count zero-price board grants filed as P as a buying cluster", () => {
    const grant = (name: string): InsiderRow => ({
      name,
      date: isoDaysAgo(10),
      change: 5047,
      shares: 20_000,
      transactionCode: "P",
      transactionPrice: null,
      amount: 0,
    });
    const detail = signal(
      assess({ insiderTransactions: ["A", "B", "C", "D"].map(grant) }),
      "insider"
    ).detail;
    expect(detail).not.toContain("người mua trên sàn");
  });
});
