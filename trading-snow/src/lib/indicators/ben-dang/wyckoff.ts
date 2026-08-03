import type { Bar, WyckoffEvent, WyckoffEventMarker, WyckoffPhase, WyckoffResult } from "./types";
import { avgVolume, findPivotHighs, findPivotLows, isBullish } from "./utils";

const EVENT_LABELS: Record<WyckoffEvent, string> = {
  PS: "PS — Preliminary Support",
  SC: "SC — Selling Climax",
  AR: "AR — Automatic Rally",
  ST: "ST — Secondary Test",
  SOS: "SOS — Sign of Strength",
  LPS: "LPS — Last Point of Support",
  PSY: "PSY — Preliminary Supply",
  BC: "BC — Buying Climax",
  UT: "UT — Upthrust",
  UTAD: "UTAD — Upthrust After Distribution",
  SOW: "SOW — Sign of Weakness",
  LPSY: "LPSY — Last Point of Supply",
};

export function computeWyckoff(bars: Bar[]): WyckoffResult {
  const empty: WyckoffResult = {
    phase: "unknown",
    phaseLabel: "Chưa xác định",
    events: [],
    summary: {
      trend: "—",
      volumePattern: "—",
      recommendation: "Cần thêm dữ liệu",
    },
  };
  if (bars.length < 15) return empty;

  const lookback = Math.min(80, bars.length);
  const slice = bars.slice(-lookback);
  const offset = bars.length - lookback;

  const highs = slice.map((b) => b.high);
  const lows = slice.map((b) => b.low);
  const rangeTop = Math.max(...highs);
  const rangeBottom = Math.min(...lows);
  const rangeSize = rangeTop - rangeBottom;
  const currentPrice = bars[bars.length - 1].close;

  const startIdx = offset + slice.findIndex((b) => b.low === rangeBottom);
  const endIdx = bars.length - 1;

  const tradingRange =
    rangeSize > 0
      ? { top: rangeTop, bottom: rangeBottom, startIndex: startIdx, endIndex: endIdx }
      : undefined;

  const trendSlope = computeTrendSlope(slice);
  const volPattern = analyzeVolumePattern(slice);
  const phase = detectPhase(slice, trendSlope, volPattern, currentPrice, rangeTop, rangeBottom);
  const events = detectWyckoffEvents(slice, offset, rangeTop, rangeBottom);

  return {
    phase: phase.phase,
    phaseLabel: phase.label,
    tradingRange,
    events,
    summary: {
      trend: phase.trendDesc,
      volumePattern: volPattern,
      recommendation: phase.recommendation,
    },
  };
}

function computeTrendSlope(slice: Bar[]): number {
  const n = slice.length;
  if (n < 5) return 0;
  const first = slice.slice(0, Math.floor(n / 3)).reduce((s, b) => s + b.close, 0);
  const last = slice.slice(-Math.floor(n / 3)).reduce((s, b) => s + b.close, 0);
  const firstAvg = first / Math.floor(n / 3);
  const lastAvg = last / Math.floor(n / 3);
  return (lastAvg - firstAvg) / firstAvg;
}

function analyzeVolumePattern(slice: Bar[]): string {
  const third = Math.floor(slice.length / 3);
  const early = slice.slice(0, third);
  const late = slice.slice(-third);
  const earlyVol = early.reduce((s, b) => s + b.volume, 0) / early.length;
  const lateVol = late.reduce((s, b) => s + b.volume, 0) / late.length;

  if (lateVol > earlyVol * 1.3) return "Volume tăng dần";
  if (lateVol < earlyVol * 0.7) return "Volume giảm dần";
  return "Volume ổn định";
}

function detectPhase(
  slice: Bar[],
  slope: number,
  volPattern: string,
  price: number,
  rangeTop: number,
  rangeBottom: number
): {
  phase: WyckoffPhase;
  label: string;
  trendDesc: string;
  recommendation: string;
} {
  const rangeMid = (rangeTop + rangeBottom) / 2;
  const inRange = price > rangeBottom * 1.02 && price < rangeTop * 0.98;
  const nearTop = price >= rangeMid + (rangeTop - rangeBottom) * 0.25;
  const nearBottom = price <= rangeMid - (rangeTop - rangeBottom) * 0.25;

  if (slope > 0.05 && !inRange) {
    return {
      phase: "markup",
      label: "Markup — Xu hướng tăng",
      trendDesc: "Giá tăng mạnh, xu hướng tăng",
      recommendation: "Theo dõi LPS để vào lệnh, tránh mua đỉnh",
    };
  }
  if (slope < -0.05 && !inRange) {
    return {
      phase: "markdown",
      label: "Markdown — Xu hướng giảm",
      trendDesc: "Giá giảm mạnh, xu hướng giảm",
      recommendation: "Chờ SC/ST hoặc tín hiệu tích lũy trước khi mua",
    };
  }
  if (inRange && nearBottom && volPattern.includes("giảm")) {
    return {
      phase: "accumulation",
      label: "Tích lũy (Accumulation)",
      trendDesc: "Giá sideway gần đáy, volume giảm",
      recommendation: "Theo dõi SOS/LPS — có thể tích lũy",
    };
  }
  if (inRange && nearTop && volPattern.includes("tăng")) {
    return {
      phase: "distribution",
      label: "Phân phối (Distribution)",
      trendDesc: "Giá sideway gần đỉnh, volume tăng",
      recommendation: "Cẩn trọng UT/UTAD — có thể phân phối",
    };
  }
  if (inRange) {
    return {
      phase: slope >= 0 ? "accumulation" : "distribution",
      label: slope >= 0 ? "Sideway — có thể tích lũy" : "Sideway — có thể phân phối",
      trendDesc: "Giá trong vùng giao dịch",
      recommendation: "Chờ breakout hoặc sự kiện Wyckoff rõ ràng",
    };
  }

  return {
    phase: "unknown",
    label: "Chưa xác định",
    trendDesc: slope > 0 ? "Xu hướng tăng nhẹ" : slope < 0 ? "Xu hướng giảm nhẹ" : "Sideway",
    recommendation: "Quan sát thêm",
  };
}

function detectWyckoffEvents(
  slice: Bar[],
  offset: number,
  rangeTop: number,
  rangeBottom: number
): WyckoffEventMarker[] {
  const events: WyckoffEventMarker[] = [];
  const rangeMid = (rangeTop + rangeBottom) / 2;

  const pivotHighs = findPivotHighs(slice, 3, 3);
  const pivotLows = findPivotLows(slice, 3, 3);

  for (const p of pivotLows) {
    const bar = slice[p.index];
    const vol = bar.volume;
    const avgVol = avgVolume(slice, p.index);
    const absIdx = offset + p.index;

    if (p.price <= rangeBottom * 1.02 && vol > avgVol * 1.5) {
      events.push({
        index: absIdx,
        event: "SC",
        price: p.price,
        label: EVENT_LABELS.SC,
      });
    } else if (p.price <= rangeMid && vol < avgVol * 0.8) {
      events.push({
        index: absIdx,
        event: "ST",
        price: p.price,
        label: EVENT_LABELS.ST,
      });
    }
  }

  for (const p of pivotHighs) {
    const bar = slice[p.index];
    const vol = bar.volume;
    const avgVol = avgVolume(slice, p.index);
    const absIdx = offset + p.index;

    if (p.price >= rangeTop * 0.98 && vol > avgVol * 1.5) {
      events.push({
        index: absIdx,
        event: "BC",
        price: p.price,
        label: EVENT_LABELS.BC,
      });
    } else if (p.price >= rangeTop * 0.95 && vol > avgVol * 1.2 && !isBullish(bar)) {
      events.push({
        index: absIdx,
        event: "UT",
        price: p.price,
        label: EVENT_LABELS.UT,
      });
    }
  }

  for (let i = 5; i < slice.length; i++) {
    const bar = slice[i];
    const prev = slice[i - 1];
    const avgVol = avgVolume(slice, i);
    const absIdx = offset + i;

    if (
      isBullish(bar) &&
      bar.close > rangeMid &&
      bar.volume > avgVol * 1.3 &&
      bar.close > prev.high
    ) {
      const dup = events.some((e) => e.event === "SOS" && Math.abs(e.index - absIdx) < 5);
      if (!dup) {
        events.push({
          index: absIdx,
          event: "SOS",
          price: bar.high,
          label: EVENT_LABELS.SOS,
        });
      }
    }

    if (
      !isBullish(bar) &&
      bar.close < rangeMid &&
      bar.volume > avgVol * 1.3 &&
      bar.close < prev.low
    ) {
      const dup = events.some((e) => e.event === "SOW" && Math.abs(e.index - absIdx) < 5);
      if (!dup) {
        events.push({
          index: absIdx,
          event: "SOW",
          price: bar.low,
          label: EVENT_LABELS.SOW,
        });
      }
    }
  }

  return events
    .sort((a, b) => a.index - b.index)
    .filter((e, i, arr) => i === 0 || e.index - arr[i - 1].index > 3)
    .slice(-12);
}
