import type { Bar, WyckoffEvent, WyckoffEventMarker, WyckoffPhase, WyckoffResult } from "./types";
import { atr, avgVolume, findPivotHighs, findPivotLows, isBullish } from "./utils";

const EVENT_LABELS: Record<WyckoffEvent, string> = {
  PS: "PS — Preliminary Support",
  SC: "SC — Selling Climax",
  AR: "AR — Automatic Rally",
  ST: "ST — Secondary Test",
  Spring: "Spring — Test dưới hỗ trợ",
  SOS: "SOS — Sign of Strength",
  LPS: "LPS — Last Point of Support",
  PSY: "PSY — Preliminary Supply",
  BC: "BC — Buying Climax",
  UT: "UT — Upthrust",
  UTAD: "UTAD — Upthrust After Distribution",
  SOW: "SOW — Sign of Weakness",
  LPSY: "LPSY — Last Point of Supply",
};

const LOOKBACK = 120;

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
  if (bars.length < 20) return empty;

  const from = Math.max(0, bars.length - LOOKBACK);
  const atrArr = atr(bars);
  const lastAtr = atrArr[bars.length - 1] || medianAtr(atrArr);
  const pivotHighs = findPivotHighs(bars, 3, 3).filter((p) => p.index >= from);
  const pivotLows = findPivotLows(bars, 3, 3).filter((p) => p.index >= from);

  const sc = findSellingClimax(bars, atrArr, from);
  const bc = findBuyingClimax(bars, atrArr, from);

  const range = buildTradingRange(bars, atrArr, from, sc, bc, pivotHighs, pivotLows);
  const events = detectEvents(bars, atrArr, from, range, sc, bc, pivotHighs, pivotLows);
  const structure = swingStructure(pivotHighs, pivotLows);
  const volPattern = analyzeVolumePattern(bars, range, sc, bc);
  const phase = detectPhase(bars, range, events, structure, lastAtr);

  return {
    phase: phase.phase,
    phaseLabel: phase.label,
    tradingRange: range
      ? {
          top: range.top,
          bottom: range.bottom,
          startIndex: range.startIndex,
          endIndex: bars.length - 1,
        }
      : undefined,
    events,
    summary: {
      trend: phase.trendDesc,
      volumePattern: volPattern,
      recommendation: phase.recommendation,
    },
  };
}

interface ClimaxHit {
  index: number;
  price: number;
  volume: number;
}

interface TradingRange {
  top: number;
  bottom: number;
  startIndex: number;
  kind: "accumulation" | "distribution" | "range";
  arIndex?: number;
  reactionIndex?: number;
}

function barRange(bar: Bar): number {
  return Math.max(0, bar.high - bar.low);
}

function closeLocation(bar: Bar): number {
  const r = barRange(bar);
  if (r <= 0) return 0.5;
  return (bar.close - bar.low) / r;
}

function medianAtr(values: number[]): number {
  const finite = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!finite.length) return 0;
  return finite[Math.floor(finite.length / 2)];
}

function bouncedUp(bars: Bar[], index: number, atrVal: number): boolean {
  const low = bars[index].low;
  const end = Math.min(bars.length - 1, index + 10);
  for (let j = index + 1; j <= end; j++) {
    if (bars[j].close > low + atrVal * 0.45 || bars[j].high > bars[index].high) return true;
  }
  return index >= bars.length - 3;
}

function reversedDown(bars: Bar[], index: number, atrVal: number): boolean {
  const high = bars[index].high;
  const end = Math.min(bars.length - 1, index + 10);
  for (let j = index + 1; j <= end; j++) {
    if (bars[j].close < high - atrVal * 0.45 || bars[j].low < bars[index].low) return true;
  }
  return index >= bars.length - 3;
}

function findSellingClimax(bars: Bar[], atrArr: number[], from: number): ClimaxHit | null {
  let best: { hit: ClimaxHit; score: number } | null = null;
  const end = bars.length - 2;
  for (let i = from + 5; i < end; i++) {
    const a = atrArr[i] || atrArr[i - 1] || 0;
    const avgVol = avgVolume(bars, i);
    if (a <= 0 || avgVol <= 0) continue;
    const bar = bars[i];
    const volRatio = bar.volume / avgVol;
    const rangeRatio = barRange(bar) / a;
    const loc = closeLocation(bar);
    if (volRatio < 1.6 || rangeRatio < 1.35 || loc > 0.45) continue;
    if (!bouncedUp(bars, i, a)) continue;
    const score = volRatio + rangeRatio + (1 - loc);
    if (!best || score > best.score) {
      best = { hit: { index: i, price: bar.low, volume: bar.volume }, score };
    }
  }
  return best?.hit ?? null;
}

function findBuyingClimax(bars: Bar[], atrArr: number[], from: number): ClimaxHit | null {
  let best: { hit: ClimaxHit; score: number } | null = null;
  const end = bars.length - 2;
  for (let i = from + 5; i < end; i++) {
    const a = atrArr[i] || atrArr[i - 1] || 0;
    const avgVol = avgVolume(bars, i);
    if (a <= 0 || avgVol <= 0) continue;
    const bar = bars[i];
    const volRatio = bar.volume / avgVol;
    const rangeRatio = barRange(bar) / a;
    const loc = closeLocation(bar);
    if (volRatio < 1.6 || rangeRatio < 1.35 || loc < 0.55) continue;
    if (!reversedDown(bars, i, a)) continue;
    const score = volRatio + rangeRatio + loc;
    if (!best || score > best.score) {
      best = { hit: { index: i, price: bar.high, volume: bar.volume }, score };
    }
  }
  return best?.hit ?? null;
}

function maxHighBetween(bars: Bar[], start: number, end: number): { index: number; price: number } | null {
  let best: { index: number; price: number } | null = null;
  for (let i = start; i <= end; i++) {
    if (!best || bars[i].high > best.price) best = { index: i, price: bars[i].high };
  }
  return best;
}

function minLowBetween(bars: Bar[], start: number, end: number): { index: number; price: number } | null {
  let best: { index: number; price: number } | null = null;
  for (let i = start; i <= end; i++) {
    if (!best || bars[i].low < best.price) best = { index: i, price: bars[i].low };
  }
  return best;
}

function buildTradingRange(
  bars: Bar[],
  atrArr: number[],
  from: number,
  sc: ClimaxHit | null,
  bc: ClimaxHit | null,
  pivotHighs: { index: number; price: number }[],
  pivotLows: { index: number; price: number }[]
): TradingRange | undefined {
  const lastAtr = atrArr[bars.length - 1] || 0;
  const preferSc =
    sc && (!bc || sc.index >= bc.index - 2 || sc.volume >= bc.volume * 0.85);

  if (sc && preferSc) {
    const arEnd = Math.min(bars.length - 1, sc.index + 25);
    const ar = maxHighBetween(bars, sc.index + 1, arEnd);
    if (ar && ar.price - sc.price >= lastAtr * 0.7) {
      return {
        top: ar.price,
        bottom: sc.price,
        startIndex: sc.index,
        kind: "accumulation",
        arIndex: ar.index,
      };
    }
  }

  if (bc) {
    const rxEnd = Math.min(bars.length - 1, bc.index + 25);
    const reaction = minLowBetween(bars, bc.index + 1, rxEnd);
    if (reaction && bc.price - reaction.price >= lastAtr * 0.7) {
      return {
        top: bc.price,
        bottom: reaction.price,
        startIndex: bc.index,
        kind: "distribution",
        reactionIndex: reaction.index,
      };
    }
  }

  const recentHighs = pivotHighs.slice(-3);
  const recentLows = pivotLows.slice(-3);
  if (recentHighs.length && recentLows.length) {
    const top = Math.max(...recentHighs.map((p) => p.price));
    const bottom = Math.min(...recentLows.map((p) => p.price));
    const startIndex = Math.min(
      ...recentHighs.map((p) => p.index),
      ...recentLows.map((p) => p.index)
    );
    if (top - bottom > lastAtr * 0.8) {
      return { top, bottom, startIndex: Math.max(from, startIndex), kind: "range" };
    }
  }

  return undefined;
}

function pushEvent(
  events: WyckoffEventMarker[],
  event: WyckoffEvent,
  index: number,
  price: number
) {
  const lastSame = [...events].reverse().find((e) => e.event === event);
  if (lastSame && index - lastSame.index < 4) return;
  const lastAny = events[events.length - 1];
  if (lastAny && lastAny.event === event && index - lastAny.index < 4) return;
  events.push({ index, event, price, label: EVENT_LABELS[event] });
}

function detectEvents(
  bars: Bar[],
  atrArr: number[],
  from: number,
  range: TradingRange | undefined,
  sc: ClimaxHit | null,
  bc: ClimaxHit | null,
  pivotHighs: { index: number; price: number }[],
  pivotLows: { index: number; price: number }[]
): WyckoffEventMarker[] {
  const events: WyckoffEventMarker[] = [];
  if (!range) return events;

  const support = range.bottom;
  const resistance = range.top;
  const mid = (support + resistance) / 2;
  const height = resistance - support;
  const lastAtr = atrArr[bars.length - 1] || height * 0.1;
  const nearSupport = (price: number) => price <= support + Math.max(lastAtr * 0.6, height * 0.12);
  const nearResistance = (price: number) =>
    price >= resistance - Math.max(lastAtr * 0.6, height * 0.12);

  if (range.kind !== "distribution" && sc) {
    const ps = [...pivotLows]
      .reverse()
      .find(
        (p) =>
          p.index < sc.index &&
          p.index >= sc.index - 20 &&
          p.index >= from &&
          bars[p.index].volume > avgVolume(bars, p.index) * 1.2 &&
          p.price > sc.price
      );
    if (ps) pushEvent(events, "PS", ps.index, ps.price);
    pushEvent(events, "SC", sc.index, sc.price);
    if (range.arIndex != null) {
      pushEvent(events, "AR", range.arIndex, resistance);
    }
  }

  if (range.kind === "distribution" && bc) {
    const psy = [...pivotHighs]
      .reverse()
      .find(
        (p) =>
          p.index < bc.index &&
          p.index >= bc.index - 20 &&
          p.index >= from &&
          bars[p.index].volume > avgVolume(bars, p.index) * 1.2 &&
          p.price < bc.price
      );
    if (psy) pushEvent(events, "PSY", psy.index, psy.price);
    pushEvent(events, "BC", bc.index, bc.price);
  }

  const afterStart = range.startIndex + 2;
  const has = (event: WyckoffEvent) => events.some((e) => e.event === event);

  for (const p of pivotLows) {
    if (p.index < afterStart) continue;
    const vol = bars[p.index].volume;
    const avgVol = avgVolume(bars, p.index);
    const scVol = sc?.volume ?? Infinity;

    if (has("SC") && nearSupport(p.price) && vol < scVol * 0.85 && vol < avgVol * 1.05) {
      pushEvent(events, "ST", p.index, p.price);
    }

    if (
      (has("ST") || has("SC")) &&
      p.price < support &&
      bars[p.index].close > support &&
      support - p.price <= Math.max(lastAtr * 1.2, height * 0.08)
    ) {
      pushEvent(events, "Spring", p.index, p.price);
    }
  }

  for (const p of pivotHighs) {
    if (p.index < afterStart) continue;
    const vol = bars[p.index].volume;
    const avgVol = avgVolume(bars, p.index);
    const bar = bars[p.index];

    if (
      (has("BC") || range.kind === "distribution") &&
      p.price > resistance &&
      bar.close < resistance &&
      vol > avgVol * 1.1
    ) {
      if (has("UT") || has("SOW")) pushEvent(events, "UTAD", p.index, p.price);
      else pushEvent(events, "UT", p.index, p.price);
    } else if (nearResistance(p.price) && !isBullish(bar) && vol > avgVol * 1.15) {
      if (range.kind === "distribution" || has("BC")) {
        pushEvent(events, "UT", p.index, p.price);
      }
    }
  }

  for (let i = afterStart + 2; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const avgVol = avgVolume(bars, i);

    if (
      (has("ST") || has("SC")) &&
      bar.low < support &&
      bar.close > support &&
      support - bar.low <= Math.max(lastAtr * 1.2, height * 0.08)
    ) {
      pushEvent(events, "Spring", i, bar.low);
    }

    if (avgVol <= 0) continue;

    if (
      (has("BC") || range.kind === "distribution") &&
      bar.high > resistance &&
      bar.close < resistance &&
      bar.volume > avgVol * 1.1
    ) {
      if (has("UT") || has("SOW")) pushEvent(events, "UTAD", i, bar.high);
      else pushEvent(events, "UT", i, bar.high);
    }

    if (
      isBullish(bar) &&
      bar.close > resistance &&
      bar.volume > avgVol * 1.25 &&
      bar.close > prev.high &&
      (has("ST") || has("Spring") || has("SC"))
    ) {
      pushEvent(events, "SOS", i, bar.close);
    }

    if (
      !isBullish(bar) &&
      bar.close < support &&
      bar.volume > avgVol * 1.25 &&
      bar.close < prev.low &&
      (has("UT") || has("UTAD") || has("BC"))
    ) {
      pushEvent(events, "SOW", i, bar.close);
    }
  }

  const sosIndex = events.find((e) => e.event === "SOS")?.index ?? Infinity;
  const sowIndex = events.find((e) => e.event === "SOW")?.index ?? Infinity;

  for (const p of pivotLows) {
    if (p.index < afterStart) continue;
    if (p.index > sosIndex && p.price >= support && p.price <= mid + height * 0.15) {
      pushEvent(events, "LPS", p.index, p.price);
    }
    if (p.index > sowIndex && p.price <= mid && !isBullish(bars[p.index])) {
      pushEvent(events, "LPSY", p.index, p.price);
    }
  }

  return events.sort((a, b) => a.index - b.index).slice(-14);
}

function swingStructure(
  pivotHighs: { index: number; price: number }[],
  pivotLows: { index: number; price: number }[]
): "up" | "down" | "side" {
  if (pivotHighs.length < 2 || pivotLows.length < 2) return "side";
  const h = pivotHighs.slice(-2);
  const l = pivotLows.slice(-2);
  const hh = h[1].price > h[0].price;
  const hl = l[1].price > l[0].price;
  const lh = h[1].price < h[0].price;
  const ll = l[1].price < l[0].price;
  if (hh && hl) return "up";
  if (lh && ll) return "down";
  return "side";
}

function analyzeVolumePattern(
  bars: Bar[],
  range: TradingRange | undefined,
  sc: ClimaxHit | null,
  bc: ClimaxHit | null
): string {
  const start = range?.startIndex ?? Math.max(0, bars.length - 40);
  const slice = bars.slice(start);
  if (slice.length < 9) return "Volume chưa rõ";

  const third = Math.max(3, Math.floor(slice.length / 3));
  const earlyVol = slice.slice(0, third).reduce((s, b) => s + b.volume, 0) / third;
  const lateVol = slice.slice(-third).reduce((s, b) => s + b.volume, 0) / third;
  const recentVol = slice.slice(-5).reduce((s, b) => s + b.volume, 0) / Math.min(5, slice.length);
  const climaxVol = Math.max(sc?.volume ?? 0, bc?.volume ?? 0);

  if (climaxVol > 0 && recentVol < climaxVol * 0.55) return "Volume cạn (dry-up) sau climax";
  if (lateVol > earlyVol * 1.3) return "Volume tăng trong trading range";
  if (lateVol < earlyVol * 0.7) return "Volume giảm trong trading range";
  return "Volume ổn định trong trading range";
}

function detectPhase(
  bars: Bar[],
  range: TradingRange | undefined,
  events: WyckoffEventMarker[],
  structure: "up" | "down" | "side",
  lastAtr: number
): {
  phase: WyckoffPhase;
  label: string;
  trendDesc: string;
  recommendation: string;
} {
  const price = bars[bars.length - 1].close;
  const types = new Set(events.map((e) => e.event));
  const hasAcc = types.has("SC") && (types.has("ST") || types.has("Spring") || types.has("AR"));
  const hasDist = types.has("BC") && (types.has("UT") || types.has("UTAD"));
  const above = range ? price > range.top + lastAtr * 0.15 : false;
  const below = range ? price < range.bottom - lastAtr * 0.15 : false;
  const inRange =
    range != null &&
    price >= range.bottom * 0.995 &&
    price <= range.top * 1.005;
  const pos = range && range.top > range.bottom
    ? (price - range.bottom) / (range.top - range.bottom)
    : 0.5;

  if (types.has("Spring") && types.has("SOS") && (above || structure === "up")) {
    return {
      phase: "markup",
      label: "Markup — Phase E (sau Spring/SOS)",
      trendDesc: "Phá range tăng sau tích lũy",
      recommendation: "Theo dõi LPS để vào nhịp, tránh đuổi đỉnh",
    };
  }
  if (types.has("UTAD") && types.has("SOW") && (below || structure === "down")) {
    return {
      phase: "markdown",
      label: "Markdown — Phase E (sau UTAD/SOW)",
      trendDesc: "Phá range giảm sau phân phối",
      recommendation: "Tránh bắt đáy; chờ SC/ST mới nếu muốn mua",
    };
  }
  if (types.has("SOS") && hasAcc) {
    return {
      phase: "accumulation",
      label: "Tích lũy — Phase D (SOS)",
      trendDesc: "Có dấu hiệu sức mạnh sau test",
      recommendation: "Chờ LPS (retest hỗ trợ) thay vì mua breakout muộn",
    };
  }
  if (types.has("SOW") && hasDist) {
    return {
      phase: "distribution",
      label: "Phân phối — Phase D (SOW)",
      trendDesc: "Có dấu hiệu yếu sau upthrust",
      recommendation: "Cẩn trọng; LPSY thường là nhịp bán",
    };
  }
  if (types.has("Spring")) {
    return {
      phase: "accumulation",
      label: "Tích lũy — Phase C (Spring)",
      trendDesc: "Test dưới hỗ trợ rồi đóng lại trong range",
      recommendation: "Spring thành công là tín hiệu mạnh — xác nhận bằng volume cạn",
    };
  }
  if (types.has("UTAD")) {
    return {
      phase: "distribution",
      label: "Phân phối — Phase C (UTAD)",
      trendDesc: "Upthrust sau phân phối, bẫy phá đỉnh",
      recommendation: "Không đuổi breakout; chờ SOW để xác nhận",
    };
  }
  if (hasAcc && inRange && pos <= 0.45) {
    return {
      phase: "accumulation",
      label: types.has("ST") ? "Tích lũy — Phase B (ST)" : "Tích lũy — Phase A (SC/AR)",
      trendDesc: "Trading range sau selling climax",
      recommendation: "Chờ Spring hoặc SOS; mua gần hỗ trợ, không mua giữa range",
    };
  }
  if (hasDist && inRange && pos >= 0.55) {
    return {
      phase: "distribution",
      label: types.has("UT") ? "Phân phối — Phase B/C (UT)" : "Phân phối — Phase A (BC)",
      trendDesc: "Trading range sau buying climax",
      recommendation: "Bán gần kháng cự; không bắt đáy trong range phân phối",
    };
  }
  if (above && structure === "up") {
    return {
      phase: "markup",
      label: "Markup — Xu hướng tăng",
      trendDesc: "Giá trên trading range, cấu trúc HH/HL",
      recommendation: "Theo xu hướng; chờ pullback LPS",
    };
  }
  if (below && structure === "down") {
    return {
      phase: "markdown",
      label: "Markdown — Xu hướng giảm",
      trendDesc: "Giá dưới trading range, cấu trúc LH/LL",
      recommendation: "Ưu tiên đứng ngoài hoặc chờ climax mới",
    };
  }
  if (inRange) {
    return {
      phase: range?.kind === "distribution" ? "distribution" : "accumulation",
      label: range?.kind === "distribution" ? "Sideway — có thể phân phối" : "Sideway — trading range",
      trendDesc: "Giá trong trading range, chưa có sự kiện then chốt",
      recommendation: "Chờ Spring/SOS hoặc UT/SOW rõ ràng",
    };
  }

  return {
    phase: "unknown",
    label: "Chưa xác định",
    trendDesc:
      structure === "up" ? "Cấu trúc tăng (HH/HL)" : structure === "down" ? "Cấu trúc giảm (LH/LL)" : "Sideway",
    recommendation: "Quan sát climax và trading range trước khi gán pha",
  };
}
