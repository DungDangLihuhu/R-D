import {
  industryValuationSell,
  mean,
  median,
  weightedMean,
  type AnalystTargetSummary,
  type IndustryMultiples,
} from "./analyst-targets";
import type {
  EarningsRow,
  InsiderRow,
  NewsRow,
  PriceLevels,
  RecommendationRow,
} from "./stock-analysis";

export type AssessmentRating =
  | "strong_sell"
  | "sell"
  | "hold"
  | "buy"
  | "strong_buy";

export interface AssessmentSignal {
  id: string;
  label: string;
  score: number;
  detail: string;
  available: boolean;
}

export interface OptionFlowSummary {
  callVolume: number;
  putVolume: number;
  putCallRatio: number;
  source?: "yahoo" | "finnhub";
}

export interface NewsSentimentSummary {
  bullishPercent: number;
  bearishPercent: number;
  companyNewsScore?: number;
}

export interface StockAssessment {
  rating: AssessmentRating;
  label: string;
  /** 0–100, 50 = trung lập */
  score: number;
  buyPrice: number;
  sellPrice: number;
  buyNote: string;
  sellNote: string;
  signals: AssessmentSignal[];
  optionFlow?: OptionFlowSummary | null;
}

const RATING_LABELS: Record<AssessmentRating, string> = {
  strong_sell: "Bán Mạnh",
  sell: "Bán",
  hold: "Giữ",
  buy: "Mua",
  strong_buy: "Mua Mạnh",
};

const POSITIVE_NEWS =
  /\b(upgrade|raised guidance|beats? estimates|record (revenue|profit)|buyback|lawsuit settled|beat consensus)\b/i;
const NEGATIVE_NEWS =
  /\b(downgrade|cut guidance|misses? estimates|lawsuit|probe|investigation|layoff|warning|restatement|fraud|plunge|going concern)\b/i;

const OPEN_MARKET_BUY = new Set(["P"]);
const OPEN_MARKET_SELL = new Set(["S"]);
const IGNORE_INSIDER = new Set(["A", "D", "F", "G", "C", "M", "X", "I", "W", "H", "J", "U"]);

function clamp(n: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function displayScore(weighted: number): number {
  return Math.round(50 + weighted * 50);
}

function scoreToRating(score: number): AssessmentRating {
  if (score >= 74) return "strong_buy";
  if (score >= 63) return "buy";
  if (score > 37) return "hold";
  if (score > 26) return "sell";
  return "strong_sell";
}

function bandScore(value: number, great: number, good: number, bad: number, terrible: number): number {
  if (value >= great) return 1;
  if (value >= good) return 0.35 + (0.65 * (value - good)) / Math.max(great - good, 1e-6);
  if (value >= bad) return ((value - bad) / Math.max(good - bad, 1e-6)) * 0.35;
  if (value >= terrible) return -0.5 * (1 - (value - terrible) / Math.max(bad - terrible, 1e-6));
  return -1;
}

function finitePositive(...values: (number | null | undefined)[]): number | undefined {
  for (const v of values) {
    if (v != null && Number.isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function resolvePeg(
  reported: number | undefined,
  pe: number | undefined,
  growthPct: number | undefined
): number | undefined {
  if (reported != null && Number.isFinite(reported) && reported > 0 && reported < 80) {
    return reported;
  }
  if (pe != null && pe > 0 && growthPct != null && growthPct > 0) {
    return pe / growthPct;
  }
  return undefined;
}

function toShortPercent(raw: number | undefined): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return undefined;
  return raw <= 1 ? raw * 100 : raw;
}

function rsiWilder(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function qualitySignal(metrics: Record<string, number>): AssessmentSignal {
  const parts: { score: number; note: string }[] = [];
  const add = (v: number | undefined, score: number, note: string) => {
    if (v == null || !Number.isFinite(v)) return;
    parts.push({ score, note });
  };

  add(metrics.epsGrowthTTMYoy, clamp(bandScore(metrics.epsGrowthTTMYoy, 30, 12, 0, -20)), "EPS");
  add(
    metrics.revenueGrowthTTMYoy,
    clamp(bandScore(metrics.revenueGrowthTTMYoy, 25, 10, 0, -12)),
    "DT"
  );
  add(metrics.grossMarginTTM, clamp(bandScore(metrics.grossMarginTTM, 55, 35, 18, 8)), "GM");
  add(metrics.netProfitMarginTTM, clamp(bandScore(metrics.netProfitMarginTTM, 22, 10, 3, -5)), "NM");
  add(metrics.roeTTM, clamp(bandScore(metrics.roeTTM, 22, 12, 6, 0)), "ROE");

  const de = metrics["totalDebt/totalEquityQuarterly"];
  if (de != null && Number.isFinite(de)) {
    parts.push({ score: clamp(bandScore(-de, -0.3, -0.8, -1.5, -3)), note: "D/E" });
  }
  add(
    metrics.currentRatioQuarterly,
    clamp(bandScore(metrics.currentRatioQuarterly, 2, 1.4, 1, 0.7)),
    "CR"
  );

  if (!parts.length) {
    return { id: "quality", label: "Chất lượng", score: 0, detail: "Không đủ chỉ số", available: false };
  }

  const score = clamp(parts.reduce((s, p) => s + p.score, 0) / parts.length);
  const positive = parts.filter((p) => p.score > 0.05).length;
  return {
    id: "quality",
    label: "Chất lượng",
    score,
    detail: `${positive}/${parts.length} nhóm tốt (tăng trưởng/biên/ROE)`,
    available: true,
  };
}

function valuationSignal(
  price: number,
  metrics: Record<string, number>,
  pegOverride?: number,
  shortPercent?: number
): AssessmentSignal {
  const parts: { score: number; note: string }[] = [];
  const pe = finitePositive(metrics.forwardPE, metrics.peTTM);
  const growth = finitePositive(metrics.epsGrowthTTMYoy, metrics.epsGrowth3Y);
  const peg = resolvePeg(pegOverride ?? metrics.pegTTM, pe, growth);
  const pfcf = metrics.pfcfShareTTM;
  const high = metrics["52WeekHigh"];
  const low = metrics["52WeekLow"];

  if (peg != null) {
    let s = 0;
    if (peg < 1) s = 0.35;
    else if (peg < 1.5) s = 0.08;
    else if (peg < 2) s = -0.2;
    else if (peg < 3) s = -0.5;
    else s = -0.85;
    parts.push({ score: s, note: `PEG ${peg.toFixed(1)}` });
  } else if (pe != null) {
    let s = 0;
    if (pe < 0) s = -0.4;
    else if (pe < 14) s = 0.2;
    else if (pe < 22) s = 0;
    else if (pe < 32) s = -0.25;
    else if (pe < 45) s = -0.5;
    else s = -0.75;
    parts.push({ score: s, note: `P/E ${pe.toFixed(0)}` });
  }

  if (pfcf != null && Number.isFinite(pfcf)) {
    if (pfcf < 0) parts.push({ score: -0.4, note: "FCF âm" });
    else if (pfcf < 15) parts.push({ score: 0.2, note: "P/FCF thấp" });
    else if (pfcf < 28) parts.push({ score: 0, note: "P/FCF vừa" });
    else if (pfcf < 45) parts.push({ score: -0.3, note: "P/FCF cao" });
    else parts.push({ score: -0.55, note: "P/FCF rất cao" });
  }

  if (high && low && high > low && price > 0) {
    const pos = (price - low) / (high - low);
    parts.push({
      score: clamp((0.52 - pos) * 0.9, -0.45, 0.22),
      note: pos > 0.9 ? "sát đỉnh 52w" : pos < 0.2 ? "gần đáy 52w" : `52w ${(pos * 100).toFixed(0)}%`,
    });
  }

  const short = toShortPercent(shortPercent);
  if (short != null) {
    if (short >= 20) parts.push({ score: -0.45, note: `short ${short.toFixed(1)}%` });
    else if (short >= 10) parts.push({ score: -0.25, note: `short ${short.toFixed(1)}%` });
    else if (short >= 5) parts.push({ score: -0.08, note: `short ${short.toFixed(1)}%` });
  }

  if (!parts.length) {
    return { id: "valuation", label: "Định giá", score: 0, detail: "Không đủ P/E · PEG", available: false };
  }

  const score = clamp(parts.reduce((s, p) => s + p.score, 0) / parts.length);
  return {
    id: "valuation",
    label: "Định giá",
    score: clamp(score),
    detail: parts.map((p) => p.note).slice(0, 3).join(" · "),
    available: true,
  };
}

function newsSignal(
  news: NewsRow[],
  sentiment?: NewsSentimentSummary | null
): AssessmentSignal {
  if (sentiment) {
    const bull = sentiment.bullishPercent > 1 ? sentiment.bullishPercent / 100 : sentiment.bullishPercent;
    const bear = sentiment.bearishPercent > 1 ? sentiment.bearishPercent / 100 : sentiment.bearishPercent;
    let score = clamp(bull - bear);
    if (sentiment.companyNewsScore != null) {
      score = clamp(score * 0.6 + (sentiment.companyNewsScore - 0.5) * 0.8);
    }
    return {
      id: "news",
      label: "Tin tức (7 ngày)",
      score,
      detail: `Sentiment ${((bull - bear) * 100).toFixed(0)}%`,
      available: true,
    };
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = news.filter((n) => {
    const t = new Date(n.date).getTime();
    return Number.isFinite(t) && t >= weekAgo;
  });
  if (!recent.length) {
    return {
      id: "news",
      label: "Tin tức (7 ngày)",
      score: 0,
      detail: "Không có tin gần đây",
      available: false,
    };
  }

  let net = 0;
  let classified = 0;
  for (const n of recent) {
    const pos = POSITIVE_NEWS.test(n.headline);
    const neg = NEGATIVE_NEWS.test(n.headline);
    if (pos === neg) continue;
    net += pos ? 1 : -1;
    classified += 1;
  }

  if (!classified) {
    return {
      id: "news",
      label: "Tin tức (7 ngày)",
      score: 0,
      detail: `${recent.length} tin · chưa rõ hướng`,
      available: true,
    };
  }

  return {
    id: "news",
    label: "Tin tức (7 ngày)",
    score: clamp((net / classified) * 0.7),
    detail: `${recent.length} tin · ${classified} có hướng`,
    available: true,
  };
}

function optionFlowSignal(flow: OptionFlowSummary | null | undefined): AssessmentSignal {
  if (!flow || flow.callVolume + flow.putVolume === 0) {
    return {
      id: "options",
      label: "Option flow",
      score: 0,
      detail: "Không có dữ liệu",
      available: false,
    };
  }
  const ratio = flow.putCallRatio;
  let score = 0;
  if (ratio < 0.45) score = 0.35;
  else if (ratio < 0.65) score = 0.12;
  else if (ratio <= 0.95) score = 0;
  else if (ratio <= 1.2) score = -0.2;
  else score = -0.5;

  const source = flow.source === "yahoo" ? "Yahoo" : flow.source === "finnhub" ? "Finnhub" : "";
  return {
    id: "options",
    label: "Option flow",
    score,
    detail: `P/C ${ratio.toFixed(2)} (tb thị trường ~0.7) · C ${flow.callVolume.toLocaleString("vi-VN")} / P ${flow.putVolume.toLocaleString("vi-VN")}${source ? ` · ${source}` : ""}`,
    available: true,
  };
}

function insiderWeight(t: InsiderRow): number {
  if (t.amount != null && Number.isFinite(t.amount) && t.amount !== 0) return Math.abs(t.amount);
  if (t.change) return Math.abs(t.change);
  return 1;
}

function classifyInsider(t: InsiderRow): "buy" | "sell" | "ignore" {
  const c = (t.transactionCode || "").toUpperCase();
  if (OPEN_MARKET_BUY.has(c)) return "buy";
  if (OPEN_MARKET_SELL.has(c)) return "sell";
  if (IGNORE_INSIDER.has(c)) return "ignore";
  if (t.change > 0) return "buy";
  if (t.change < 0) return "sell";
  if ((t.amount ?? 0) > 0) return "buy";
  if ((t.amount ?? 0) < 0) return "sell";
  return "ignore";
}

function insiderSignal(transactions: InsiderRow[]): AssessmentSignal {
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const recent = transactions.filter((t) => {
    const ts = new Date(t.date).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
  if (!recent.length) {
    return {
      id: "insider",
      label: "Insider",
      score: 0,
      detail: "Không có GD nội bộ 90 ngày",
      available: false,
    };
  }

  let buy = 0;
  let sell = 0;
  let ignored = 0;
  for (const t of recent) {
    const kind = classifyInsider(t);
    const w = insiderWeight(t);
    if (kind === "buy") buy += w;
    else if (kind === "sell") sell += w;
    else ignored += 1;
  }

  if (buy + sell === 0) {
    return {
      id: "insider",
      label: "Insider",
      score: 0,
      detail: `${recent.length} GD · chủ yếu grant/tax, bỏ qua`,
      available: false,
    };
  }

  const net = (buy - sell) / (buy + sell);
  let score = 0;
  if (net > 0.35) score = 0.45;
  else if (net > 0.05) score = 0.15;
  else if (net > -0.55) score = 0;
  else if (net > -0.85) score = -0.2;
  else score = -0.45;

  return {
    id: "insider",
    label: "Insider",
    score,
    detail: `Mở TT net ${net >= 0 ? "+" : ""}${(net * 100).toFixed(0)}% (bán ròng là bình thường)${ignored ? ` · ${ignored} bỏ` : ""}`,
    available: true,
  };
}

function technicalSignal(
  price: number,
  levels: PriceLevels,
  priceHistory?: { close: number }[]
): AssessmentSignal {
  const supports = levels.support.map((s) => s.price).filter((p) => p < price);
  const resistances = levels.resistance.map((r) => r.price).filter((p) => p > price);

  let score = 0;
  const parts: string[] = [];

  if (supports.length) {
    const nearest = Math.max(...supports);
    const dist = (price - nearest) / price;
    score += clamp(0.28 - dist * 3.5, -0.2, 0.32);
    if (dist < 0.03) parts.push("gần hỗ trợ");
  }

  if (resistances.length) {
    const nearest = Math.min(...resistances);
    const dist = (nearest - price) / price;
    score += clamp(dist * 1.6 - 0.22, -0.4, 0.12);
    if (dist < 0.03) parts.push("gần kháng cự");
  }

  const closes = priceHistory?.map((p) => p.close).filter((c) => c > 0) ?? [];
  const rsi = rsiWilder(closes);
  if (rsi != null) {
    if (rsi >= 75) {
      score -= 0.35;
      parts.push(`RSI ${rsi.toFixed(0)} quá mua`);
    } else if (rsi >= 68) {
      score -= 0.18;
      parts.push(`RSI ${rsi.toFixed(0)}`);
    } else if (rsi <= 28) {
      score += 0.22;
      parts.push(`RSI ${rsi.toFixed(0)} quá bán`);
    } else if (rsi <= 35) {
      score += 0.1;
      parts.push(`RSI ${rsi.toFixed(0)}`);
    }
  }

  return {
    id: "technical",
    label: "Kỹ thuật",
    score: clamp(score),
    detail: parts.length ? parts.join(" · ") : "Trung lập vs hỗ trợ/kháng cự",
    available: true,
  };
}

function earningsSignal(rows: EarningsRow[] | undefined): AssessmentSignal {
  const recent = (rows ?? [])
    .filter((e) => e.surprisePercent != null && Number.isFinite(e.surprisePercent))
    .slice(0, 4);
  if (recent.length < 2) {
    return {
      id: "earnings",
      label: "KQKD",
      score: 0,
      detail: "Chưa đủ lịch sử surprise",
      available: false,
    };
  }

  const beats = recent.filter((e) => (e.surprisePercent ?? 0) > 0).length;
  const avg = recent.reduce((s, e) => s + (e.surprisePercent ?? 0), 0) / recent.length;
  const beatRatio = beats / recent.length;
  let score = (beatRatio - 0.5) * 1.1;
  score += clamp(avg / 25, -0.25, 0.25);

  return {
    id: "earnings",
    label: "KQKD",
    score: clamp(score),
    detail: `${beats}/${recent.length} quý vượt dự báo · TB ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%`,
    available: true,
  };
}

function recBuyShare(row: RecommendationRow): number {
  const total = row.strongBuy + row.buy + row.hold + row.sell + row.strongSell;
  if (!total) return 0;
  return (row.strongBuy + row.buy) / total;
}

function recommendationSignal(rows: RecommendationRow[]): AssessmentSignal {
  const latest = rows[0];
  if (!latest) {
    return { id: "recs", label: "Khuyến nghị", score: 0, detail: "Không có dữ liệu", available: false };
  }
  const total =
    latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  if (!total) {
    return { id: "recs", label: "Khuyến nghị", score: 0, detail: "Không có dữ liệu", available: false };
  }

  const buyPct = recBuyShare(latest);
  const sellPct = (latest.sell + latest.strongSell) / total;
  let score = clamp((buyPct - 0.55) / 0.32);
  if (sellPct > 0.1) score -= clamp((sellPct - 0.1) * 1.6, 0, 0.4);

  if (rows[1]) {
    const delta = buyPct - recBuyShare(rows[1]);
    score = clamp(score * 0.75 + clamp(delta * 6, -0.35, 0.35) * 0.25);
  }

  return {
    id: "recs",
    label: "Khuyến nghị",
    score: clamp(score),
    detail: `${total} CTCK · ${(buyPct * 100).toFixed(0)}% mua (tb phố ~55%) · Giữ ${latest.hold} · Bán ${latest.sell + latest.strongSell}`,
    available: true,
  };
}

function typicalDailyMovePct(history?: { close: number }[]): number {
  const closes = (history ?? []).map((p) => p.close).filter((c) => c > 0);
  if (closes.length < 6) return 0.02;
  const n = Math.min(20, closes.length - 1);
  let sum = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    sum += Math.abs(closes[i] - closes[i - 1]) / closes[i - 1];
  }
  return clamp(sum / n, 0.008, 0.055);
}

function nearestBelowLevel(
  levels: { price: number; label: string }[],
  price: number,
  minGap: number
): { price: number; label: string } | undefined {
  return levels
    .filter((l) => l.price > 0 && l.price <= price * (1 - minGap))
    .sort((a, b) => b.price - a.price)[0];
}

function nearestAboveLevel(
  levels: { price: number; label: string }[],
  price: number,
  minGap: number
): { price: number; label: string } | undefined {
  return levels
    .filter((l) => l.price >= price * (1 + minGap))
    .sort((a, b) => a.price - b.price)[0];
}

function growthToPercent(raw: number): number {
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
}

function inPriceBand(value: number, price: number): boolean {
  return value > price * 0.35 && value <= price * 2.8;
}

type FundPoint = { price: number; label: string };

function uniqueJoin(parts: string[]): string {
  return [...new Set(parts.filter(Boolean))].join(" + ");
}

/**
 * Neo định giá độc lập — không dùng P/E hiện tại × EPS (vòng về giá spot).
 * PEG 1.0 / P/E 16× / P/FCF 16× = vùng rẻ; PEG 2.0 / P/E 26× / P/FCF 28× = vùng đắt.
 */
function fundamentalAnchors(
  price: number,
  metrics?: Record<string, number>,
  pegRatio?: number
): {
  buy: FundPoint | null;
  sellAbove: FundPoint | null;
  sellRaw: number | null;
  mid: number | null;
  sellLabels: string[];
} {
  const empty = {
    buy: null,
    sellAbove: null,
    sellRaw: null,
    mid: null,
    sellLabels: [] as string[],
  };
  if (!metrics || !(price > 0)) return empty;

  const buyPts: FundPoint[] = [];
  const sellPts: FundPoint[] = [];
  const fair: number[] = [];
  let addedEpsPeg = false;

  const consider = (value: number, label: string, side: "buy" | "sell") => {
    if (!Number.isFinite(value) || !inPriceBand(value, price)) return;
    fair.push(value);
    if (side === "buy" && value < price * 0.97) buyPts.push({ price: value, label });
    if (side === "sell") sellPts.push({ price: value, label });
  };

  const eps = metrics.epsTTM;
  const growthRaw = finitePositive(metrics.epsGrowthTTMYoy, metrics.epsGrowth3Y);
  const growthPct = growthRaw != null ? growthToPercent(growthRaw) : undefined;

  if (eps != null && eps > 0 && growthPct != null && growthPct >= 5) {
    const g = Math.min(growthPct, 40);
    consider(eps * g, "PEG 1.0", "buy");
    consider(eps * g * 2, "PEG 2.0", "sell");
    addedEpsPeg = true;
  }

  if (eps != null && eps > 0) {
    consider(eps * 16, "P/E 16×", "buy");
    consider(eps * 26, "P/E 26×", "sell");
  }

  const pfcf = metrics.pfcfShareTTM;
  if (pfcf != null && Number.isFinite(pfcf) && pfcf > 2 && pfcf < 200) {
    const fcfps = price / pfcf;
    if (fcfps > 0) {
      consider(fcfps * 16, "P/FCF 16×", "buy");
      consider(fcfps * 28, "P/FCF 28×", "sell");
    }
  }

  if (!addedEpsPeg && pegRatio != null && pegRatio > 0.2 && pegRatio < 20) {
    consider(price / pegRatio, "PEG 1.0", "buy");
    consider((price * 2) / pegRatio, "PEG 2.0", "sell");
  }

  const buyMed = median(buyPts.map((p) => p.price));
  const sellMed = median(sellPts.map((p) => p.price));
  const sellAbovePts = sellPts.filter((p) => p.price > price * 1.03);
  const sellAboveMed = median(sellAbovePts.map((p) => p.price));

  return {
    buy: buyMed != null ? { price: buyMed, label: uniqueJoin(buyPts.map((p) => p.label)) } : null,
    sellAbove:
      sellAboveMed != null
        ? { price: sellAboveMed, label: uniqueJoin(sellAbovePts.map((p) => p.label)) }
        : null,
    sellRaw: sellMed,
    mid: mean(fair),
    sellLabels: [...new Set(sellPts.map((p) => p.label))],
  };
}

function clampBuyAnchor(value: number, price: number): number {
  return Math.min(price * 0.995, Math.max(price * 0.58, value));
}

function clampSellAnchor(value: number, price: number): number {
  return Math.max(price * 1.005, Math.min(price * 1.55, value));
}

export interface BuySellContext {
  analystTarget?: AnalystTargetSummary | null;
  industry?: IndustryMultiples | null;
}

export function computeBuySellPrices(
  price: number,
  levels: PriceLevels,
  priceHistory?: { close: number }[],
  metrics?: Record<string, number>,
  pegRatio?: number,
  context?: BuySellContext
): {
  buyPrice: number;
  sellPrice: number;
  buyNote: string;
  sellNote: string;
} {
  const daily = typicalDailyMovePct(priceHistory);
  const minGap = Math.max(0.012, daily * 1.15);

  const support = nearestBelowLevel(levels.support, price, minGap);
  const resistance = nearestAboveLevel(levels.resistance, price, minGap);

  let techBuy: number;
  let techBuyNote: string;
  if (support) {
    techBuy = support.price * (1 - daily * 0.25);
    techBuyNote = `${support.label} − buffer`;
  } else {
    techBuy = price * (1 - Math.max(0.025, daily * 1.6));
    techBuyNote = `Buffer KT ~${((1 - techBuy / price) * 100).toFixed(1)}% dưới giá`;
  }

  let techSell: number;
  let techSellNote: string;
  if (resistance) {
    techSell = resistance.price;
    techSellNote = resistance.label;
  } else {
    techSell = price * (1 + Math.max(0.03, daily * 1.8));
    techSellNote = `Buffer KT ~${((techSell / price - 1) * 100).toFixed(1)}% trên giá`;
  }

  const fund = fundamentalAnchors(price, metrics, pegRatio);
  const expensive = fund.mid != null && price > fund.mid * 1.08;
  const cheap = fund.mid != null && price < fund.mid * 0.92;
  const alreadyAboveFundSell = fund.sellRaw != null && price >= fund.sellRaw * 0.98;

  const fundBuyClamped = fund.buy ? clampBuyAnchor(fund.buy.price, price) : null;
  const fundSellClamped = fund.sellAbove ? clampSellAnchor(fund.sellAbove.price, price) : null;

  const buyBits: string[] = [techBuyNote];
  const sellBits: string[] = [];

  let buyPrice = techBuy;
  if (expensive) {
    if (fundBuyClamped != null) {
      buyPrice = 0.55 * techBuy + 0.45 * Math.min(techBuy, fundBuyClamped);
      buyBits.push(fund.buy?.label ?? "định giá");
    }
    buyBits.push("đắt vs định giá");
  } else if (cheap) {
    buyBits.push("rẻ vs định giá · giữ mốc kỹ thuật");
  } else if (fundBuyClamped != null) {
    buyPrice = (techBuy + Math.min(techBuy, fundBuyClamped)) / 2;
    if (fund.buy) buyBits.push(fund.buy.label);
  }

  const analyst = context?.analystTarget;
  const industryAnchor = industryValuationSell(price, metrics, context?.industry);
  const sellParts: { price: number; weight: number; label: string }[] = [];

  if (resistance && resistance.price > price * (1 + minGap * 0.5)) {
    sellParts.push({ price: resistance.price, weight: 1, label: resistance.label });
  }
  if (analyst && analyst.price > price * 1.012) {
    sellParts.push({ price: analyst.price, weight: 1.25, label: analyst.label });
  }
  if (industryAnchor && industryAnchor.price > price * 1.012) {
    sellParts.push({ price: industryAnchor.price, weight: 1, label: industryAnchor.label });
  }

  const hasStreetOrIndustry = Boolean(
    (analyst && analyst.price > 0) || industryAnchor
  );

  let sellPrice: number;
  if (hasStreetOrIndustry && sellParts.length) {
    sellPrice = weightedMean(sellParts) ?? techSell;
    sellBits.push(...sellParts.map((p) => p.label));
    if (analyst && analyst.price <= price * 1.012) {
      const cap = resistance
        ? Math.max(price * (1 + minGap), Math.min(resistance.price, price * (1 + Math.max(0.03, daily * 1.6))))
        : price * (1 + Math.max(0.025, daily * 1.4));
      sellPrice = Math.min(sellPrice, cap);
      sellBits.push("giá ≥ PT CTCK 3 tháng");
    }
  } else {
    sellBits.push(techSellNote);
    sellPrice = techSell;
    if (alreadyAboveFundSell) {
      const bounce = price * (1 + Math.max(0.018, daily * 1.15));
      const cap = price * (1 + Math.max(0.04, daily * 2.1));
      sellPrice = Math.min(techSell, cap);
      if (sellPrice > bounce * 1.35) sellPrice = Math.min(sellPrice, bounce * 1.2);
      sellBits.push("đã trên mốc bán cơ bản");
      if (fund.sellLabels.length) sellBits.push(uniqueJoin(fund.sellLabels));
    } else if (expensive && fundSellClamped != null) {
      sellPrice = Math.min(techSell, fundSellClamped);
      sellBits.push(fund.sellAbove?.label ?? "định giá");
    } else if (cheap && fundSellClamped != null && fundSellClamped > techSell) {
      sellPrice = 0.45 * techSell + 0.55 * fundSellClamped;
      sellBits.push(fund.sellAbove?.label ?? "định giá");
    } else if (!expensive && !cheap && fundSellClamped != null) {
      sellPrice = (techSell + Math.max(techSell, fundSellClamped)) / 2;
      if (fund.sellAbove) sellBits.push(fund.sellAbove.label);
    }
  }

  sellPrice = Math.max(price * 1.005, Math.min(sellPrice, price * 2.3));

  const closes = (priceHistory ?? []).map((p) => p.close).filter((c) => c > 0);
  const rsi = rsiWilder(closes);
  if (rsi != null && rsi >= 68) {
    const deeper = price - (price - buyPrice) * 1.12;
    buyPrice = Math.min(buyPrice, Math.max(price * 0.58, deeper));
    buyBits.push(`RSI ${rsi.toFixed(0)} quá mua`);
  } else if (rsi != null && rsi <= 32) {
    buyPrice = price - (price - buyPrice) * 0.88;
    buyBits.push(`RSI ${rsi.toFixed(0)} quá bán`);
  }

  if (buyPrice >= price) buyPrice = price * (1 - minGap);
  if (sellPrice <= price) sellPrice = price * (1 + minGap);
  if (sellPrice <= buyPrice) sellPrice = buyPrice * (1 + Math.max(0.04, daily * 2.5));

  const buyNote = uniqueJoin(buyBits).replace(/ \+ /g, " · ");
  let sellNote = uniqueJoin(sellBits).replace(/ \+ /g, " · ");

  const reward = sellPrice - price;
  const risk = price - buyPrice;
  if (risk > 0 && reward / risk < 1) {
    sellNote += " · R:R < 1 tại giá hiện tại";
  }

  return { buyPrice, sellPrice, buyNote, sellNote };
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  quality: 0.18,
  valuation: 0.24,
  technical: 0.14,
  earnings: 0.12,
  news: 0.1,
  insider: 0.08,
  options: 0.08,
  recs: 0.06,
};

export function computeStockAssessment(input: {
  price: number;
  metrics: Record<string, number>;
  news: NewsRow[];
  insiderTransactions: InsiderRow[];
  recommendations: RecommendationRow[];
  priceLevels: PriceLevels;
  optionFlow?: OptionFlowSummary | null;
  earningsHistory?: EarningsRow[];
  priceHistory?: { date?: string; close: number }[];
  newsSentiment?: NewsSentimentSummary | null;
  pegRatio?: number;
  shortPercentOfFloat?: number;
  analystTarget?: AnalystTargetSummary | null;
  industry?: IndustryMultiples | null;
}): StockAssessment {
  const shortFromMetrics =
    input.shortPercentOfFloat ??
    input.metrics.shortPercentOutstanding ??
    input.metrics.shortPercentFloat;
  const shortPct = toShortPercent(shortFromMetrics);

  const signals: AssessmentSignal[] = [
    qualitySignal(input.metrics),
    valuationSignal(input.price, input.metrics, input.pegRatio, shortPct),
    technicalSignal(input.price, input.priceLevels, input.priceHistory),
    earningsSignal(input.earningsHistory),
    newsSignal(input.news, input.newsSentiment),
    insiderSignal(input.insiderTransactions),
    optionFlowSignal(input.optionFlow),
    recommendationSignal(input.recommendations),
  ];

  let weighted = 0;
  let weightSum = 0;
  for (const s of signals) {
    if (!s.available) continue;
    const w = SIGNAL_WEIGHTS[s.id] ?? 0.1;
    weighted += s.score * w;
    weightSum += w;
  }
  if (weightSum > 0) weighted /= weightSum;
  if (weightSum < 0.55) weighted *= weightSum / 0.55;

  const score = displayScore(weighted);
  const rating = scoreToRating(score);
  const { buyPrice, sellPrice, buyNote, sellNote } = computeBuySellPrices(
    input.price,
    input.priceLevels,
    input.priceHistory,
    input.metrics,
    input.pegRatio,
    { analystTarget: input.analystTarget, industry: input.industry }
  );

  return {
    rating,
    label: RATING_LABELS[rating],
    score,
    buyPrice,
    sellPrice,
    buyNote,
    sellNote,
    signals,
    optionFlow: input.optionFlow,
  };
}

export function assessmentColor(rating: AssessmentRating): string {
  switch (rating) {
    case "strong_buy":
      return "text-emerald-700";
    case "buy":
      return "text-emerald-600";
    case "hold":
      return "text-amber-600";
    case "sell":
      return "text-rose-600";
    case "strong_sell":
      return "text-rose-700";
  }
}

export function assessmentBg(rating: AssessmentRating): string {
  switch (rating) {
    case "strong_buy":
      return "border-emerald-200 bg-emerald-50";
    case "buy":
      return "border-emerald-100 bg-emerald-50/60";
    case "hold":
      return "border-amber-200 bg-amber-50";
    case "sell":
      return "border-rose-100 bg-rose-50/60";
    case "strong_sell":
      return "border-rose-200 bg-rose-50";
  }
}

export function signalScoreLabel(score: number, available: boolean): string {
  if (!available) return "—";
  return String(Math.round(50 + score * 50));
}
