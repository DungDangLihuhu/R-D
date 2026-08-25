import type { Bar, SwingPoint } from "./types";

export function toBars(
  points: {
    date: string;
    label: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }[]
): Bar[] {
  return points.map((p, index) => ({
    ...p,
    volume: p.volume ?? 0,
    index,
  }));
}

export function atr(bars: Bar[], period = 14): number[] {
  const result = new Array<number>(bars.length).fill(0);
  if (bars.length < 2) return result;

  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trs.push(bars[i].high - bars[i].low);
    } else {
      const prev = bars[i - 1];
      trs.push(
        Math.max(
          bars[i].high - bars[i].low,
          Math.abs(bars[i].high - prev.close),
          Math.abs(bars[i].low - prev.close)
        )
      );
    }
  }

  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      sum += trs[i];
      if (i === period - 1) result[i] = sum / period;
    } else {
      result[i] = (result[i - 1] * (period - 1) + trs[i]) / period;
    }
  }
  return result;
}

export function findPivotHighs(bars: Bar[], left: number, right: number): SwingPoint[] {
  const pivots: SwingPoint[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isPivot = true;
    const price = bars[i].high;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].high >= price) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ index: i, price });
  }
  return pivots;
}

export function findPivotLows(bars: Bar[], left: number, right: number): SwingPoint[] {
  const pivots: SwingPoint[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isPivot = true;
    const price = bars[i].low;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].low <= price) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) pivots.push({ index: i, price });
  }
  return pivots;
}

export function avgVolume(bars: Bar[], index: number, lookback = 20): number {
  const start = Math.max(0, index - lookback);
  const slice = bars.slice(start, index);
  if (!slice.length) return bars[index]?.volume ?? 0;
  return slice.reduce((s, b) => s + b.volume, 0) / slice.length;
}

export function bodySize(bar: Bar): number {
  return Math.abs(bar.close - bar.open);
}

export function isBullish(bar: Bar): boolean {
  return bar.close >= bar.open;
}

export function adaptivePivotPeriod(barCount: number, preferred = 10): number {
  if (barCount < 9) return Math.max(1, Math.floor(barCount / 3));
  return Math.max(2, Math.min(preferred, Math.floor(barCount / 5)));
}

export function adaptiveSwingLength(barCount: number, preferred = 50): number {
  if (barCount < 20) return Math.max(2, Math.floor(barCount / 6));
  return Math.max(5, Math.min(preferred, Math.floor(barCount / 3)));
}

export function isPivotHighAt(bars: Bar[], index: number, left: number, right = left): boolean {
  if (index < left || index >= bars.length - right) return false;
  const price = bars[index].high;
  for (let j = index - left; j <= index + right; j++) {
    if (j === index) continue;
    if (bars[j].high >= price) return false;
  }
  return true;
}

export function isPivotLowAt(bars: Bar[], index: number, left: number, right = left): boolean {
  if (index < left || index >= bars.length - right) return false;
  const price = bars[index].low;
  for (let j = index - left; j <= index + right; j++) {
    if (j === index) continue;
    if (bars[j].low <= price) return false;
  }
  return true;
}

export function clusterPrices(
  prices: number[],
  tolerance: number
): { price: number; count: number }[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { price: number; count: number; sum: number }[] = [];

  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.price) <= tolerance) {
      last.count++;
      last.sum += p;
      last.price = last.sum / last.count;
    } else {
      clusters.push({ price: p, count: 1, sum: p });
    }
  }

  return clusters
    .map((c) => ({ price: c.price, count: c.count }))
    .sort((a, b) => b.count - a.count || a.price - b.price);
}
