import { describe, expect, it } from "vitest";
import {
  parseYahooEarningsHistory,
  parseYahooNews,
  parseYahooRecommendationTrend,
  resolveExtendedQuote,
  yahooInsiderCode,
} from "./yahoo";

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

describe("Yahoo fallbacks for Finnhub data", () => {
  const epoch = (date: string) => ({ raw: Date.parse(`${date}T00:00:00Z`) / 1000, fmt: date });

  it("turns Yahoo's EPS history into newest-first rows with surprise in percent", () => {
    const rows = parseYahooEarningsHistory([
      { quarter: epoch("2026-03-31"), epsActual: { raw: 2.01 }, epsEstimate: { raw: 1.94 }, surprisePercent: { raw: 0.0346 } },
      { quarter: epoch("2026-06-30"), epsActual: { raw: 2.02 }, epsEstimate: { raw: 1.89 }, surprisePercent: { raw: 0.0674 } },
      { quarter: epoch("2025-12-31"), epsActual: { raw: 2.84 }, epsEstimate: { raw: 2.5 } },
    ]);
    expect(rows.map((r) => r.period)).toEqual(["2026-06-30", "2026-03-31", "2025-12-31"]);
    expect(rows[0].surprisePercent).toBeCloseTo(6.74, 6);
    // Không có surprise thì tự tính từ EPS thực tế và dự báo.
    expect(rows[2].surprisePercent).toBeCloseTo(13.6, 6);
  });

  it("dates the recommendation trend by month", () => {
    const rows = parseYahooRecommendationTrend(
      [
        { period: "0m", strongBuy: 6, buy: 19, hold: 13, sell: 3, strongSell: 3 },
        { period: "-1m", strongBuy: 6, buy: 19, hold: 14, sell: 3, strongSell: 2 },
        { period: "-2m", strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      ],
      new Date("2026-01-15T00:00:00Z")
    );
    expect(rows.map((r) => r.period)).toEqual(["2026-01-01", "2025-12-01"]);
    expect(rows[0]).toMatchObject({ strongBuy: 6, buy: 19, hold: 13, sell: 3, strongSell: 3 });
  });

  it("keeps only news Yahoo tags with the symbol", () => {
    const rows = parseYahooNews(
      [
        { title: "Apple ships", publisher: "Barrons", providerPublishTime: 1_790_000_000, link: "https://x/1", relatedTickers: ["AAPL", "META"] },
        { title: "Markets wrap", providerPublishTime: 1_790_000_100, relatedTickers: ["^GSPC"] },
        { title: "", providerPublishTime: 1_790_000_200, relatedTickers: ["AAPL"] },
      ],
      "aapl"
    );
    expect(rows).toEqual([
      { headline: "Apple ships", date: new Date(1_790_000_000 * 1000).toISOString(), source: "Barrons", url: "https://x/1" },
    ]);
  });
});
