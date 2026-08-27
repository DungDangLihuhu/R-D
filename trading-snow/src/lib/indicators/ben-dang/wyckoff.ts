import type {
  Bar,
  WyckoffEntry,
  WyckoffEvent,
  WyckoffEventMarker,
  WyckoffPhase,
  WyckoffResult,
} from "./types";
import { atr, avgVolume, findPivotHighs, findPivotLows, isBullish } from "./utils";

const EVENT_LABELS: Record<WyckoffEvent, string> = {
  PS: "PS — Preliminary Support",
  SC: "SC — Selling Climax",
  AR: "AR — Automatic Rally",
  ST: "ST — Secondary Test",
  Spring: "Spring — Test dưới Ice",
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
const KEY_EVENTS: WyckoffEvent[] = [
  "PS",
  "SC",
  "AR",
  "ST",
  "Spring",
  "SOS",
  "LPS",
  "PSY",
  "BC",
  "UT",
  "UTAD",
  "SOW",
  "LPSY",
];

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
  const entry = computeEntry(bars, range, events, phase.phase, lastAtr);

  return {
    phase: phase.phase,
    phaseLabel: phase.label,
    tradingRange: range
      ? {
          top: range.top,
          bottom: range.bottom,
          creek: range.top,
          ice: range.bottom,
          startIndex: range.startIndex,
          endIndex: bars.length - 1,
        }
      : undefined,
    events,
    entry,
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

function volumeRatio(bars: Bar[], index: number): number | null {
  const avg = avgVolume(bars, index);
  const vol = bars[index]?.volume ?? 0;
  if (avg <= 0 || vol <= 0) return null;
  return vol / avg;
}

function volAtLeast(ratio: number | null, min: number): boolean {
  if (ratio == null) return true;
  return ratio >= min;
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
  const last = bars.length - 1;
  for (let i = from + 5; i < last; i++) {
    const a = atrArr[i] || atrArr[i - 1] || 0;
    if (a <= 0) continue;
    const bar = bars[i];
    const vr = volumeRatio(bars, i);
    const rangeRatio = barRange(bar) / a;
    const loc = closeLocation(bar);
    const minRange = vr == null ? 1.5 : 1.35;
    if (!volAtLeast(vr, 1.55) || rangeRatio < minRange || loc > 0.45) continue;
    if (!bouncedUp(bars, i, a)) continue;
    const score = (vr ?? 1.2) + rangeRatio + (1 - loc);
    if (!best || score > best.score) {
      best = { hit: { index: i, price: bar.low, volume: bar.volume }, score };
    }
  }
  return best?.hit ?? null;
}

function findBuyingClimax(bars: Bar[], atrArr: number[], from: number): ClimaxHit | null {
  let best: { hit: ClimaxHit; score: number } | null = null;
  const last = bars.length - 1;
  for (let i = from + 5; i < last; i++) {
    const a = atrArr[i] || atrArr[i - 1] || 0;
    if (a <= 0) continue;
    const bar = bars[i];
    const vr = volumeRatio(bars, i);
    const rangeRatio = barRange(bar) / a;
    const loc = closeLocation(bar);
    const minRange = vr == null ? 1.5 : 1.35;
    if (!volAtLeast(vr, 1.55) || rangeRatio < minRange || loc < 0.55) continue;
    if (!reversedDown(bars, i, a)) continue;
    const score = (vr ?? 1.2) + rangeRatio + loc;
    if (!best || score > best.score) {
      best = { hit: { index: i, price: bar.high, volume: bar.volume }, score };
    }
  }
  return best?.hit ?? null;
}

function firstRallyPeak(
  bars: Bar[],
  start: number,
  atrVal: number,
  maxBars: number
): { index: number; price: number } | null {
  const end = Math.min(bars.length - 1, start + maxBars);
  if (start > end) return null;
  let peak = { index: start, price: bars[start].high };
  for (let i = start; i <= end; i++) {
    if (bars[i].high > peak.price) {
      peak = { index: i, price: bars[i].high };
      continue;
    }
    if (peak.price - bars[i].low >= atrVal * 0.45 && i - peak.index >= 1) {
      return peak;
    }
  }
  return peak.price > 0 ? peak : null;
}

function firstReactionLow(
  bars: Bar[],
  start: number,
  atrVal: number,
  maxBars: number
): { index: number; price: number } | null {
  const end = Math.min(bars.length - 1, start + maxBars);
  if (start > end) return null;
  let trough = { index: start, price: bars[start].low };
  for (let i = start; i <= end; i++) {
    if (bars[i].low <= trough.price) {
      trough = { index: i, price: bars[i].low };
      continue;
    }
    if (bars[i].high - trough.price >= atrVal * 0.45 && i - trough.index >= 1) {
      return trough;
    }
  }
  return trough.price > 0 ? trough : null;
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
    sc && (!bc || sc.index >= bc.index - 2 || sc.volume >= bc.volume * 0.85 || bc.volume <= 0);

  if (sc && preferSc) {
    const ar = firstRallyPeak(bars, sc.index + 1, lastAtr, 14);
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
    const reaction = firstReactionLow(bars, bc.index + 1, lastAtr, 14);
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
  price: number,
  label?: string
) {
  const lastSame = [...events].reverse().find((e) => e.event === event);
  if (lastSame && index - lastSame.index < 4) return;
  events.push({ index, event, price, label: label ?? EVENT_LABELS[event] });
}

function lastEvent(events: WyckoffEventMarker[], event: WyckoffEvent): WyckoffEventMarker | undefined {
  return [...events].reverse().find((e) => e.event === event);
}

function pruneEvents(events: WyckoffEventMarker[]): WyckoffEventMarker[] {
  const sorted = [...events].sort((a, b) => a.index - b.index);
  const latest = new Map<WyckoffEvent, WyckoffEventMarker>();
  for (const e of sorted) latest.set(e.event, e);

  const keep = new Set<string>();
  for (const type of KEY_EVENTS) {
    const hit = latest.get(type);
    if (hit) keep.add(`${hit.event}-${hit.index}`);
  }
  for (const e of sorted) {
    if (e.event === "ST" || e.event === "Spring" || e.event === "LPS" || e.event === "LPSY") {
      keep.add(`${e.event}-${e.index}`);
    }
  }

  return sorted.filter((e) => keep.has(`${e.event}-${e.index}`)).slice(-16);
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
          volAtLeast(volumeRatio(bars, p.index), 1.2) &&
          p.price > sc.price
      );
    if (ps) pushEvent(events, "PS", ps.index, ps.price);
    pushEvent(events, "SC", sc.index, sc.price);
    if (range.arIndex != null) {
      pushEvent(events, "AR", range.arIndex, resistance, "AR — Automatic Rally");
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
          volAtLeast(volumeRatio(bars, p.index), 1.2) &&
          p.price < bc.price
      );
    if (psy) pushEvent(events, "PSY", psy.index, psy.price);
    pushEvent(events, "BC", bc.index, bc.price);
    if (range.reactionIndex != null) {
      pushEvent(
        events,
        "AR",
        range.reactionIndex,
        range.bottom,
        "AR — Automatic Reaction"
      );
    }
  }

  const afterStart = range.startIndex + 2;
  const has = (event: WyckoffEvent) => events.some((e) => e.event === event);

  for (const p of pivotLows) {
    if (p.index < afterStart) continue;
    const vol = bars[p.index].volume;
    const scVol = sc?.volume ?? Infinity;

    if (
      has("SC") &&
      nearSupport(p.price) &&
      (scVol === Infinity || scVol <= 0 || vol <= 0 || vol < scVol * 0.85)
    ) {
      pushEvent(events, "ST", p.index, p.price);
    }

    if (
      (has("ST") || has("SC") || has("AR")) &&
      p.price < support &&
      bars[p.index].close > support &&
      support - p.price <= Math.max(lastAtr * 1.2, height * 0.08)
    ) {
      pushEvent(events, "Spring", p.index, p.price);
    }
  }

  for (const p of pivotHighs) {
    if (p.index < afterStart) continue;
    const vr = volumeRatio(bars, p.index);
    const bar = bars[p.index];

    if (
      (has("BC") || range.kind === "distribution") &&
      p.price > resistance &&
      bar.close < resistance &&
      volAtLeast(vr, 1.05)
    ) {
      if (has("UT") || has("SOW")) pushEvent(events, "UTAD", p.index, p.price);
      else pushEvent(events, "UT", p.index, p.price);
    } else if (nearResistance(p.price) && !isBullish(bar) && volAtLeast(vr, 1.1)) {
      if (range.kind === "distribution" || has("BC")) {
        pushEvent(events, "UT", p.index, p.price);
      }
    }

    const bcVol = bc?.volume ?? 0;
    if (
      has("BC") &&
      nearResistance(p.price) &&
      p.index > (bc?.index ?? 0) + 3 &&
      bcVol > 0 &&
      bars[p.index].volume > 0 &&
      bars[p.index].volume < bcVol * 0.9
    ) {
      pushEvent(events, "ST", p.index, p.price, "ST — Secondary Test (cung)");
    }
  }

  for (let i = afterStart + 2; i < bars.length; i++) {
    const bar = bars[i];
    const prev = bars[i - 1];
    const vr = volumeRatio(bars, i);

    if (
      (has("ST") || has("SC") || has("AR")) &&
      bar.low < support &&
      bar.close > support &&
      support - bar.low <= Math.max(lastAtr * 1.2, height * 0.08)
    ) {
      pushEvent(events, "Spring", i, bar.low);
    }

    if (
      (has("BC") || range.kind === "distribution") &&
      bar.high > resistance &&
      bar.close < resistance &&
      volAtLeast(vr, 1.05)
    ) {
      if (has("UT") || has("SOW")) pushEvent(events, "UTAD", i, bar.high);
      else pushEvent(events, "UT", i, bar.high);
    }

    if (
      isBullish(bar) &&
      bar.close > resistance &&
      bar.close > prev.high &&
      volAtLeast(vr, 1.2) &&
      (has("ST") || has("Spring") || has("SC") || has("AR") || has("LPS"))
    ) {
      pushEvent(events, "SOS", i, bar.close);
    }

    if (
      !isBullish(bar) &&
      bar.close < support &&
      bar.close < prev.low &&
      volAtLeast(vr, 1.2) &&
      (has("UT") || has("UTAD") || has("BC") || has("AR"))
    ) {
      pushEvent(events, "SOW", i, bar.close);
    }
  }

  const sosIndex = events.find((e) => e.event === "SOS")?.index ?? Infinity;
  const sowIndex = events.find((e) => e.event === "SOW")?.index ?? Infinity;
  const springIndex = lastEvent(events, "Spring")?.index ?? -1;

  for (const p of pivotLows) {
    if (p.index < afterStart) continue;
    if (p.index > sosIndex && p.price >= support && p.price <= mid + height * 0.18) {
      pushEvent(events, "LPS", p.index, p.price);
    }
    if (
      springIndex >= 0 &&
      p.index > springIndex &&
      p.index < sosIndex &&
      nearSupport(p.price) &&
      p.price > (lastEvent(events, "Spring")?.price ?? 0)
    ) {
      pushEvent(events, "ST", p.index, p.price, "ST — Test Spring");
    }
  }

  for (const p of pivotHighs) {
    if (p.index < afterStart) continue;
    if (p.index > sowIndex && p.price >= mid && p.price <= resistance + lastAtr * 0.35) {
      pushEvent(events, "LPSY", p.index, p.price);
    }
  }

  return pruneEvents(events);
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

  const hasVol = slice.filter((b) => b.volume > 0).length >= slice.length * 0.4;
  if (!hasVol) return "Thiếu volume — đọc theo giá/ATR";

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
  const hasDist = types.has("BC") && (types.has("UT") || types.has("UTAD") || types.has("AR"));
  const above = range ? price > range.top + lastAtr * 0.15 : false;
  const below = range ? price < range.bottom - lastAtr * 0.15 : false;
  const inRange =
    range != null &&
    price >= range.bottom * 0.995 &&
    price <= range.top * 1.005;
  const pos =
    range && range.top > range.bottom
      ? (price - range.bottom) / (range.top - range.bottom)
      : 0.5;

  if (types.has("Spring") && types.has("SOS") && (above || structure === "up")) {
    return {
      phase: "markup",
      label: "Markup — Phase E (sau Spring/SOS)",
      trendDesc: "Phá Creek tăng sau tích lũy",
      recommendation: "Không đuổi; vào LPS khi giá hồi về Creek",
    };
  }
  if (types.has("UTAD") && types.has("SOW") && (below || structure === "down")) {
    return {
      phase: "markdown",
      label: "Markdown — Phase E (sau UTAD/SOW)",
      trendDesc: "Phá Ice giảm sau phân phối",
      recommendation: "Tránh bắt đáy; chờ SC/Spring mới tại Ice",
    };
  }
  if (types.has("SOS") && (hasAcc || types.has("Spring"))) {
    return {
      phase: "accumulation",
      label: "Tích lũy — Phase D (SOS)",
      trendDesc: "Có dấu hiệu sức mạnh sau test Ice",
      recommendation: "Chờ LPS (retest Creek) — đó là giá nên vào",
    };
  }
  if (types.has("SOW") && hasDist) {
    return {
      phase: "distribution",
      label: "Phân phối — Phase D (SOW)",
      trendDesc: "Có dấu hiệu yếu sau upthrust",
      recommendation: "Không mua gần Creek; LPSY là nhịp bán",
    };
  }
  if (types.has("Spring")) {
    return {
      phase: "accumulation",
      label: "Tích lũy — Phase C (Spring)",
      trendDesc: "Test dưới Ice rồi đóng lại trong range",
      recommendation: "Vào khi giá trở lại trên Ice; cắt dưới đáy Spring",
    };
  }
  if (types.has("UTAD")) {
    return {
      phase: "distribution",
      label: "Phân phối — Phase C (UTAD)",
      trendDesc: "Upthrust sau phân phối, bẫy phá đỉnh",
      recommendation: "Không đuổi breakout; chờ SOW, không vào long",
    };
  }
  if (hasAcc && inRange && pos <= 0.45) {
    return {
      phase: "accumulation",
      label: types.has("ST") ? "Tích lũy — Phase B (ST)" : "Tích lũy — Phase A (SC/AR)",
      trendDesc: "Trading range sau selling climax",
      recommendation: "Mua gần Ice/ST; không mua giữa range hay Creek",
    };
  }
  if (hasDist && inRange && pos >= 0.55) {
    return {
      phase: "distribution",
      label: types.has("UT") ? "Phân phối — Phase B/C (UT)" : "Phân phối — Phase A (BC)",
      trendDesc: "Trading range sau buying climax",
      recommendation: "Không mua premium; nếu mua thì chờ Spring tại Ice",
    };
  }
  if (above && structure === "up") {
    return {
      phase: "markup",
      label: "Markup — Xu hướng tăng",
      trendDesc: "Giá trên Creek, cấu trúc HH/HL",
      recommendation: "Theo xu hướng; giá nên vào là pullback Creek/LPS",
    };
  }
  if (below && structure === "down") {
    return {
      phase: "markdown",
      label: "Markdown — Xu hướng giảm",
      trendDesc: "Giá dưới Ice, cấu trúc LH/LL",
      recommendation: "Đứng ngoài; chờ climax mới rồi mới tính giá vào",
    };
  }
  if (inRange) {
    const distLike = range?.kind === "distribution";
    return {
      phase: distLike ? "distribution" : "accumulation",
      label: distLike ? "Sideway — thiên phân phối" : "Sideway — trading range",
      trendDesc: distLike
        ? "Range sau buying climax; Ice = hỗ trợ, Creek = kháng cự"
        : "Giá trong range; Ice = hỗ trợ, Creek = kháng cự",
      recommendation: distLike
        ? "Không đuổi Creek; giá nên vào chỉ khi Spring tại Ice"
        : "Mua 1/4 dưới range (gần Ice), chờ Spring/SOS",
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

function nearLevel(price: number, target: number, atrVal: number, height: number): boolean {
  const band = Math.max(atrVal * 0.55, height * 0.08, target * 0.012);
  return Math.abs(price - target) <= band;
}

function inDiscount(price: number, ice: number, height: number, atrVal: number): boolean {
  return price <= ice + height * 0.32 + atrVal * 0.15 && price >= ice - atrVal * 0.35;
}

function computeEntry(
  bars: Bar[],
  range: TradingRange | undefined,
  events: WyckoffEventMarker[],
  phase: WyckoffPhase,
  lastAtr: number
): WyckoffEntry | undefined {
  if (!range || range.top <= range.bottom) return undefined;

  const price = bars[bars.length - 1].close;
  const ice = range.bottom;
  const creek = range.top;
  const height = creek - ice;
  const spring = lastEvent(events, "Spring");
  const lps = lastEvent(events, "LPS");
  const sos = lastEvent(events, "SOS");
  const st = lastEvent(events, "ST");

  const stanceAt = (target: number, buyIfDiscount = false): "buy" | "wait" => {
    if (nearLevel(price, target, lastAtr, height)) return "buy";
    if (buyIfDiscount && inDiscount(price, ice, height, lastAtr)) return "buy";
    return "wait";
  };

  if (phase === "distribution" || phase === "markdown") {
    return {
      price: ice,
      stop: ice - lastAtr * 0.8,
      action: "avoid",
      label: "Ice (chờ Spring)",
      reason:
        phase === "markdown"
          ? "Markdown — không bắt đáy. Chỉ vào long khi có SC/Spring tại Ice."
          : "Phân phối — không mua gần Creek. Mốc tham chiếu nếu Spring: Ice.",
    };
  }

  if (spring && !sos) {
    const entry = Math.max(ice, Math.min(ice + height * 0.12, spring.price + lastAtr * 0.2));
    return {
      price: entry,
      stop: Math.min(spring.price, ice) - lastAtr * 0.35,
      action: stanceAt(entry, true),
      label: "Sau Spring, trên Ice",
      reason: "Spring thành công — vào khi giá trở lại trên Ice, cắt dưới đáy Spring.",
    };
  }

  if (lps) {
    return {
      price: lps.price,
      stop: ice - lastAtr * 0.35,
      action: stanceAt(lps.price),
      label: "LPS",
      reason: "Last Point of Support — điểm vào chuẩn sau SOS, không đuổi phá Creek.",
    };
  }

  if (sos || phase === "markup") {
    const chasing = price > creek + Math.max(lastAtr * 0.35, height * 0.05);
    return {
      price: creek,
      stop: ice - lastAtr * 0.25,
      action: chasing ? "wait" : stanceAt(creek),
      label: sos ? "Creek (chờ LPS)" : "Pullback Creek",
      reason: sos
        ? "Đã SOS — chờ pullback về Creek/LPS, tránh đuổi breakout."
        : "Markup — vào nhịp hồi về Creek (kháng cự cũ thành hỗ trợ).",
    };
  }

  const stNearIce = st && st.price >= ice * 0.97 && st.price <= ice + height * 0.35 ? st.price : null;
  const entry = stNearIce ?? ice + height * 0.18;
  return {
    price: entry,
    stop: ice - lastAtr * 0.45,
    action: stanceAt(entry, true),
    label: stNearIce ? "ST / gần Ice" : "Gần Ice (discount)",
    reason: "Tích lũy/sideway — mua 1/4 dưới của range, không mua giữa range hay Creek.",
  };
}
