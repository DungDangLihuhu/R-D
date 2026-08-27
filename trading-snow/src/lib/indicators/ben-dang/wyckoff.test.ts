import { describe, expect, it } from "vitest";
import type { Bar } from "./types";
import { computeWyckoff } from "./wyckoff";

function bar(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100
): Bar {
  return {
    index,
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    label: String(index),
    open,
    high,
    low,
    close,
    volume,
  };
}

function genericRange(volume = 100): Bar[] {
  const closes = [100, 103, 106, 103, 100, 97, 94, 97];
  return Array.from({ length: 80 }, (_, index) => {
    const close = closes[index % closes.length];
    return bar(index, close, close + 0.8, close - 0.8, close, volume);
  });
}

function accumulation(): Bar[] {
  const bars: Bar[] = [];
  let price = 120;
  for (let index = 0; index < 20; index++) {
    const open = price;
    price -= 0.9;
    bars.push(bar(index, open, open + 0.3, price - 0.3, price, 100));
  }

  bars.push(bar(20, 102, 103, 90, 92, 320)); // SC
  bars.push(bar(21, 92, 98, 91, 97, 180));
  bars.push(bar(22, 97, 105, 96, 103, 160)); // AR peak
  bars.push(bar(23, 103, 104, 99, 100, 120)); // confirms AR
  bars.push(bar(24, 100, 103, 96, 101, 100));
  bars.push(bar(25, 101, 102, 95, 97, 95));
  bars.push(bar(26, 97, 101, 94, 99, 90));
  bars.push(bar(27, 99, 101, 91, 97, 75)); // ST
  bars.push(bar(28, 97, 103, 95, 101, 90));
  bars.push(bar(29, 101, 104, 97, 102, 95));
  bars.push(bar(30, 102, 103, 96, 98, 85));
  bars.push(bar(31, 98, 102, 95, 100, 80));
  bars.push(bar(32, 100, 103, 96, 101, 85));
  bars.push(bar(33, 101, 102, 89, 97, 80)); // Spring, low effort
  bars.push(bar(34, 97, 101, 95, 100, 85));
  bars.push(bar(35, 100, 103, 97, 102, 90));
  bars.push(bar(36, 102, 104, 99, 103, 95));
  bars.push(bar(37, 103, 104, 100, 102, 90));
  bars.push(bar(38, 102, 108, 101, 107, 240)); // SOS
  bars.push(bar(39, 107, 109, 106, 108, 140)); // confirms SOS
  return bars;
}

describe("computeWyckoff safeguards", () => {
  it("does not invent Wyckoff events or entries without volume", () => {
    const result = computeWyckoff(genericRange(0), "1d");

    expect(result.events).toEqual([]);
    expect(result.entry).toBeUndefined();
    expect(result.confidence.level).toBe("low");
  });

  it("keeps a generic pivot range unconfirmed and non-actionable", () => {
    const result = computeWyckoff(genericRange(), "1d");

    expect(result.tradingRange?.kind).toBe("range");
    expect(result.events).toEqual([]);
    expect(result.phase).toBe("unknown");
    expect(result.entry).toBeUndefined();
  });

  it("never confirms an event on the newest candle", () => {
    const bars = accumulation();
    const result = computeWyckoff(bars, "1d");

    expect(result.events.every((event) => event.index < bars.length - 1)).toBe(true);
  });

  it("does not repaint structure when only the forming candle changes", () => {
    const calm = accumulation();
    const volatile = accumulation();
    const index = volatile.length - 1;
    volatile[index] = bar(index, 108, 140, 80, 85, 900);

    const first = computeWyckoff(calm, "1d");
    const second = computeWyckoff(volatile, "1d");
    const eventKeys = (result: typeof first) =>
      result.events.map((event) => `${event.event}:${event.index}`);

    expect(eventKeys(second)).toEqual(eventKeys(first));
    expect(second.tradingRange).toEqual(first.tradingRange);
    expect(second.phase).toBe(first.phase);
  });

  it("keeps a confirmed accumulation actionable but conditional", () => {
    const result = computeWyckoff(accumulation(), "1d");
    const events = new Set(result.events.map((event) => event.event));

    expect(events.has("SC")).toBe(true);
    expect(events.has("AR")).toBe(true);
    expect(events.has("Spring")).toBe(true);
    expect(events.has("SOS")).toBe(true);
    expect(result.confidence.level).toBe("high");
    expect(result.entry).toBeDefined();
  });

  it("expires an old structure after sustained markup", () => {
    const bars = accumulation();
    for (let index = 40; index < 65; index++) {
      const price = 125 + (index - 40) * 0.5;
      bars.push(bar(index, price - 0.4, price + 1, price - 1, price, 120));
    }

    const result = computeWyckoff(bars, "1d");
    const staleCreek = 105;

    expect(result.tradingRange?.creek).not.toBe(staleCreek);
    expect(result.entry?.price).not.toBe(staleCreek);
  });

  it("does not create an AR from a rally without a confirming pullback", () => {
    const bars: Bar[] = [];
    let price = 120;
    for (let index = 0; index < 20; index++) {
      const open = price;
      price -= 0.9;
      bars.push(bar(index, open, open + 0.3, price - 0.3, price, 100));
    }
    bars.push(bar(20, 102, 103, 90, 92, 320));
    for (let index = 21; index < 38; index++) {
      const open = 92 + (index - 21) * 1.2;
      bars.push(bar(index, open, open + 1.5, open - 0.2, open + 1.1, 130));
    }

    const result = computeWyckoff(bars, "1d");

    expect(result.events.some((event) => event.event === "AR")).toBe(false);
    expect(result.tradingRange?.kind).not.toBe("accumulation");
  });
});
