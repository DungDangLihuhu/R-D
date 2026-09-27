import { describe, expect, it } from "vitest";
import { downsampleWeekly, formatDecimal, formatPercent, formatPnlArrow } from "./format";
import { formatChartPrice } from "./chart-domain";

describe("Vietnamese decimals", () => {
  it("uses a decimal comma like money does", () => {
    expect(formatPercent(-0.8)).toBe("-0,80%");
    expect(formatPercent(2.9)).toBe("+2,90%");
    expect(formatDecimal(38.916, 2)).toBe("38,92");
    expect(formatDecimal(12345.678, 1)).toBe("12.345,7");
    expect(formatPnlArrow(-3.456)).toBe("▼ 3,46%");
    expect(formatChartPrice(344.62)).toBe("344,6");
  });

  it("never prints a negative zero", () => {
    expect(formatPercent(-0.001)).toBe("0,00%");
    expect(formatDecimal(-0.04, 1)).toBe("0,0");
  });
});

describe("downsampleWeekly", () => {
  it("keeps the last session of each week, plus the first and last points", () => {
    const days = ["2026-01-02", "2026-01-05", "2026-01-07", "2026-01-09", "2026-01-12", "2026-01-13"];
    expect(downsampleWeekly(days.map((date) => ({ date }))).map((p) => p.date)).toEqual([
      "2026-01-02",
      "2026-01-09",
      "2026-01-13",
    ]);
  });
});
