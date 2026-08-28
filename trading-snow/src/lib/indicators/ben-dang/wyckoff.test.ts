import { describe, expect, it } from "vitest";
import type { Bar } from "./types";
import { computeWyckoff, longEntryStop } from "./wyckoff";

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

  it("uses the All timeframe as context, not an immediate buy trigger", () => {
    const result = computeWyckoff(accumulation(), "all");

    expect(result.confidence.score).toBeLessThan(70);
    expect(result.entry?.action).not.toBe("buy");
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

function distribution(): Bar[] {
  const bars: Bar[] = [];
  let price = 80;
  for (let index = 0; index < 20; index++) {
    const open = price;
    price += 0.9;
    bars.push(bar(index, open, price + 0.3, open - 0.3, price, 100));
  }

  bars.push(bar(20, 98, 110, 97, 108, 320)); // BC
  bars.push(bar(21, 108, 109, 102, 103, 180));
  bars.push(bar(22, 103, 104, 95, 97, 160)); // AR trough
  bars.push(bar(23, 97, 101, 96, 100, 120));
  bars.push(bar(24, 100, 104, 99, 102, 110));
  bars.push(bar(25, 102, 105, 101, 104, 100));
  bars.push(bar(26, 104, 106, 102, 103, 95));
  bars.push(bar(27, 103, 112, 102, 104, 150)); // UT above Creek, close back in
  bars.push(bar(28, 104, 105, 101, 102, 90));
  bars.push(bar(29, 102, 104, 100, 101, 85));
  bars.push(bar(30, 101, 103, 99, 100, 80));
  bars.push(bar(31, 100, 102, 98, 99, 80));
  bars.push(bar(32, 99, 118, 98, 104, 160)); // UTAD new high after return to range
  bars.push(bar(33, 104, 105, 101, 102, 90));
  bars.push(bar(34, 102, 103, 99, 100, 85));
  bars.push(bar(35, 100, 101, 91, 92, 240)); // SOW below Ice
  bars.push(bar(36, 92, 93, 90, 91, 140));
  bars.push(bar(37, 91, 106, 90, 104, 70)); // weak LPSY rally
  bars.push(bar(38, 104, 105, 101, 102, 65));
  bars.push(bar(39, 102, 103, 99, 100, 60));
  bars.push(bar(40, 100, 101, 97, 98, 55));
  bars.push(bar(41, 98, 99, 96, 97, 50));
  return bars;
}

describe("computeWyckoff distribution confirmation", () => {
  it("requires a new high after returning to the range before labeling UTAD", () => {
    const bars = distribution();
    const result = computeWyckoff(bars, "1d");
    const events = new Set(result.events.map((event) => event.event));

    expect(events.has("BC")).toBe(true);
    expect(events.has("UT")).toBe(true);
    expect(events.has("UTAD")).toBe(true);
    expect(events.has("SOW")).toBe(true);
    expect(events.has("LPSY")).toBe(true);
    expect(result.phase).toBe("distribution");
    expect(result.entry?.action).toBe("avoid");
  });

  it("does not upgrade a second equal-high upthrust to UTAD", () => {
    const bars = distribution().slice(0, 32);
    bars[31] = bar(31, 100, 102, 98, 99, 80);
    bars.push(bar(32, 99, 109, 98, 104, 150));
    bars.push(bar(33, 104, 105, 101, 102, 90));
    bars.push(bar(34, 102, 103, 99, 100, 85));

    const result = computeWyckoff(bars, "1d");

    expect(result.events.some((event) => event.event === "UTAD")).toBe(false);
  });

  it("does not label LPSY when the rally expands volume versus SOW", () => {
    const bars = distribution();
    bars[37] = bar(37, 91, 106, 90, 104, 400);

    const result = computeWyckoff(bars, "1d");

    expect(result.events.some((event) => event.event === "LPSY")).toBe(false);
  });
});

describe("longEntryStop", () => {
  it("keeps the stop below a ST/LPS printed under Ice", () => {
    // Old formula: ice - 0.45*ATR = 50 - 0.18 = 49.82, above a $48.50 ST entry.
    const stop = longEntryStop(48.5, 50, 0.4, 0.45);
    expect(stop).toBeLessThan(48.5);
    expect(stop).toBeCloseTo(48.5 - 0.4 * 0.45, 8);
  });

  it("still stops below Ice when buying Creek", () => {
    const stop = longEntryStop(110, 100, 2, 0.25);
    expect(stop).toBeLessThan(100);
    expect(stop).toBeCloseTo(100 - 0.5, 8);
  });
});

describe("computeWyckoff long stops", () => {
  it("never places a long stop at or above the entry", () => {
    for (const bars of [accumulation(), distribution()]) {
      const result = computeWyckoff(bars, "1d");
      if (result.entry?.stop != null && result.entry.stop > 0) {
        expect(result.entry.stop).toBeLessThan(result.entry.price);
      }
    }
  });
});
