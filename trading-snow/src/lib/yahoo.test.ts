import { describe, expect, it } from "vitest";
import { resolveExtendedQuote, yahooInsiderCode } from "./yahoo";

describe("yahooInsiderCode", () => {
  it("only codes real open-market trades as P or S", () => {
    expect(yahooInsiderCode("Purchase at price 95.00 per share.")).toBe("P");
    expect(yahooInsiderCode("Sale at price 37.59 per share.")).toBe("S");
    expect(yahooInsiderCode("Sale at price 330.19 - 331.00 per share.")).toBe("S");
  });

  it("keeps grants, gifts, exercises and blank rows out of buying", () => {
    expect(yahooInsiderCode("Stock Award(Grant) at price 0.00 per share.")).toBe("A");
    expect(yahooInsiderCode("Stock Gift at price 0.00 per share.")).toBe("G");
    expect(
      yahooInsiderCode("Conversion of Exercise of derivative security at price 25.00 per share.")
    ).toBe("M");
    expect(yahooInsiderCode("")).toBe("J");
    expect(yahooInsiderCode(undefined)).toBe("J");
  });
});

describe("resolveExtendedQuote", () => {
  const afterHours = {
    marketState: "POST",
    regularMarketPrice: 337.02,
    postMarketPrice: 336.94,
    postMarketChange: -0.08,
    postMarketChangePercent: -0.024,
    chartPreviousClose: 339.74,
  };

  it("keeps the day's close and move apart from the after-hours move", () => {
    const quote = resolveExtendedQuote({
      ...afterHours,
      regularMarketChange: -2.72,
      regularMarketChangePercent: -0.8,
    });
    expect(quote).toMatchObject({ price: 336.94, changePercent: -0.024, marketSession: "post" });
    expect(quote?.regular).toEqual({ price: 337.02, change: -2.72, changePercent: -0.8 });
  });

  it("derives the day's move from the previous close when Yahoo leaves it out", () => {
    expect(resolveExtendedQuote(afterHours)?.regular?.changePercent).toBeCloseTo(-0.8, 2);
  });

  it("skips the day's move once the previous close has rolled to the last close", () => {
    const quote = resolveExtendedQuote({
      marketState: "PRE",
      regularMarketPrice: 337.02,
      preMarketPrice: 338,
      chartPreviousClose: 337.02,
    });
    expect(quote?.marketSession).toBe("pre");
    expect(quote?.regular).toBeUndefined();
  });

  it("has no separate close during the regular session", () => {
    const quote = resolveExtendedQuote({
      marketState: "REGULAR",
      regularMarketPrice: 340,
      chartPreviousClose: 337.02,
    });
    expect(quote?.regular).toBeUndefined();
    expect(quote?.changePercent).toBeCloseTo(0.884, 2);
  });
});
