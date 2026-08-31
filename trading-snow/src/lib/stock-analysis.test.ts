import { describe, expect, it } from "vitest";
import { mergeAnalysisMetrics } from "./stock-analysis";
import { yahooStatsHasFundamentals, yahooStatsToFinnhubMetrics } from "./yahoo";

describe("mergeAnalysisMetrics", () => {
  it("lets Finnhub overwrite Yahoo when Finnhub has a number", () => {
    expect(
      mergeAnalysisMetrics({ peTTM: 18 }, { peTTM: 40, pb: 3 })
    ).toEqual({ peTTM: 18, pb: 3 });
  });

  it("keeps Yahoo when Finnhub metric payload is empty", () => {
    expect(mergeAnalysisMetrics({}, { peTTM: 22, epsTTM: 1.4 })).toEqual({
      peTTM: 22,
      epsTTM: 1.4,
    });
  });
});

describe("yahooStatsToFinnhubMetrics", () => {
  it("maps Yahoo decimals onto Finnhub percent / million keys", () => {
    const m = yahooStatsToFinnhubMetrics({
      trailingPe: 24,
      trailingEps: 2.5,
      marketCap: 5_000_000_000,
      profitMargins: 0.12,
      returnOnEquity: 0.18,
      earningsGrowth: 0.1,
      dividendYield: 0.015,
      debtToEquity: 54,
      freeCashflow: 250_000_000,
      totalCash: 800_000_000,
      sharesOutstanding: 200_000_000,
    });
    expect(m.peTTM).toBe(24);
    expect(m.epsTTM).toBe(2.5);
    expect(m.marketCapitalization).toBe(5000);
    expect(m.netProfitMarginTTM).toBeCloseTo(12);
    expect(m.roeTTM).toBeCloseTo(18);
    expect(m.epsGrowthTTMYoy).toBeCloseTo(10);
    expect(m.dividendYieldIndicatedAnnual).toBeCloseTo(1.5);
    expect(m["totalDebt/totalEquityQuarterly"]).toBeCloseTo(0.54);
    expect(m.pfcfShareTTM).toBeCloseTo(20);
    expect(m.cashPerSharePerShareQuarterly).toBeCloseTo(4);
  });

  it("treats PE / market cap as enough Yahoo fundamentals", () => {
    expect(
      yahooStatsHasFundamentals({ trailingPe: 19, marketCap: 1_000_000 })
    ).toBe(true);
    expect(yahooStatsHasFundamentals({})).toBe(false);
  });
});
