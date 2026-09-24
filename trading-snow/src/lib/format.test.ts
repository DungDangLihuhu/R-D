import { describe, expect, it } from "vitest";
import { formatDecimal, formatPercent, formatPnlArrow } from "./format";
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
