import { describe, expect, it } from "vitest";
import {
  aggregateTo4h,
  sessionHoursFromYahooMeta,
  stripTrailingQuoteSnapshot,
  type OhlcPoint,
} from "./chart-history";

function point(date: string, price: number, volume = 100): OhlcPoint {
  return {
    date,
    label: date,
    open: price,
    high: price + 1,
    low: price - 1,
    close: price + 0.5,
    volume,
  };
}

describe("stripTrailingQuoteSnapshot", () => {
  it("removes an irregular intrahour Yahoo quote snapshot", () => {
    const points = [
      point("2026-08-27T13:30:00.000Z", 100),
      point("2026-08-27T14:30:00.000Z", 101),
      point("2026-08-27T14:49:21.000Z", 102, 0),
    ];

    expect(stripTrailingQuoteSnapshot(points, "1h")).toHaveLength(2);
  });

  it("removes duplicate daily, weekly and monthly snapshots", () => {
    const daily = [
      point("2026-08-25T13:30:00.000Z", 100),
      point("2026-08-26T13:30:00.000Z", 101),
      point("2026-08-26T15:12:11.000Z", 102, 0),
    ];
    const weekly = [
      point("2026-08-17T04:00:00.000Z", 100),
      point("2026-08-24T04:00:00.000Z", 101),
      point("2026-08-27T15:12:11.000Z", 102, 0),
    ];
    const monthly = [
      point("2026-07-01T04:00:00.000Z", 100),
      point("2026-08-01T04:00:00.000Z", 101),
      point("2026-08-27T15:12:11.000Z", 102, 0),
    ];

    expect(stripTrailingQuoteSnapshot(daily, "1d")).toHaveLength(2);
    expect(stripTrailingQuoteSnapshot(weekly, "1w")).toHaveLength(2);
    expect(stripTrailingQuoteSnapshot(monthly, "all")).toHaveLength(2);
  });
});

describe("aggregateTo4h", () => {
  it("anchors groups at the exchange session open", () => {
    const points = Array.from({ length: 7 }, (_, index) =>
      point(
        `2026-08-26T${String(13 + index).padStart(2, "0")}:30:00.000Z`,
        100 + index,
        10 + index
      )
    );

    const bars = aggregateTo4h(points, "America/New_York");

    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({
      date: "2026-08-26T13:30:00.000Z",
      open: 100,
      close: 103.5,
      volume: 46,
    });
    expect(bars[1]).toMatchObject({
      date: "2026-08-26T17:30:00.000Z",
      open: 104,
      close: 106.5,
      volume: 45,
    });
  });

  it("ignores premarket hours when grouping a US cash session", () => {
    const points = [
      point("2026-08-26T12:30:00.000Z", 90, 5),
      ...Array.from({ length: 7 }, (_, index) =>
        point(
          `2026-08-26T${String(13 + index).padStart(2, "0")}:30:00.000Z`,
          100 + index,
          10 + index
        )
      ),
    ];

    const bars = aggregateTo4h(points, "America/New_York");

    expect(bars).toHaveLength(2);
    expect(bars[0].date).toBe("2026-08-26T13:30:00.000Z");
    expect(bars[0].open).toBe(100);
  });

  it("drops a still-forming last 4H group before the session completes", () => {
    const completeDay = Array.from({ length: 7 }, (_, index) =>
      point(
        `2026-08-25T${String(13 + index).padStart(2, "0")}:30:00.000Z`,
        100 + index
      )
    );
    const formingDay = Array.from({ length: 5 }, (_, index) =>
      point(
        `2026-08-26T${String(13 + index).padStart(2, "0")}:30:00.000Z`,
        110 + index
      )
    );

    const bars = aggregateTo4h(
      [...completeDay, ...formingDay],
      "America/New_York"
    );

    expect(bars).toHaveLength(3);
    expect(bars[2]).toMatchObject({
      date: "2026-08-26T13:30:00.000Z",
      open: 110,
    });
    expect(bars.some((bar) => bar.date === "2026-08-26T17:30:00.000Z")).toBe(
      false
    );
  });

  it("reads regular hours from Yahoo session metadata", () => {
    const hours = sessionHoursFromYahooMeta(
      {
        currentTradingPeriod: {
          regular: {
            start: Date.parse("2026-08-26T13:30:00.000Z") / 1000,
            end: Date.parse("2026-08-26T20:00:00.000Z") / 1000,
          },
        },
      },
      "America/New_York"
    );

    expect(hours).toEqual({ startMinutes: 9 * 60 + 30, endMinutes: 16 * 60 });
  });
});
