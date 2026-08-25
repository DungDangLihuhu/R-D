import type {
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
}

export interface StockAssessment {
  rating: AssessmentRating;
  label: string;
  /** 0–100, 50 = trung lập */
  score: number;
  buyPrice: number;
  sellPrice: number;
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
  /\b(tăng|surge|soar|rally|beat|exceed|growth|profit|record|upgrade|bull|breakout|mua|buy|strong|positive|partnership|deal|win)\b/i;
const NEGATIVE_NEWS =
  /\b(giảm|fall|drop|plunge|miss|loss|cut|downgrade|bear|sell|bán|lawsuit|probe|investigation|warning|weak|layoff|delay)\b/i;

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
  if (score >= 70) return "strong_buy";
  if (score >= 58) return "buy";
  if (score > 42) return "hold";
  if (score > 30) return "sell";
  return "strong_sell";
}

function bandScore(value: number, great: number, good: number, bad: number, terrible: number): number {
  if (value >= great) return 1;
  if (value >= good) return 0.35 + (0.65 * (value - good)) / Math.max(great - good, 1e-6);
  if (value >= bad) return ((value - bad) / Math.max(good - bad, 1e-6)) * 0.35;
  if (value >= terrible) return -0.5 * (1 - (value - terrible) / Math.max(bad - terrible, 1e-6));
  return -1;
}

function fundamentalSignal(metrics: Record<string, number>): AssessmentSignal {
  const parts: { score: number; note: string }[] = [];

  const add = (v: number | undefined, score: number, note: string) => {
    if (v == null || !Number.isFinite(v)) return;
    parts.push({ score, note });
  };

  add(
    metrics.epsGrowthTTMYoy,
    clamp(bandScore(metrics.epsGrowthTTMYoy, 25, 8, 0, -15)),
    "EPS"
  );
  add(
    metrics.revenueGrowthTTMYoy,
    clamp(bandScore(metrics.revenueGrowthTTMYoy, 20, 6, 0, -10)),
    "DT"
  );
  add(
    metrics.grossMarginTTM,
    clamp(bandScore(metrics.grossMarginTTM, 50, 30, 15, 5)),
    "GM"
  );
  add(
    metrics.netProfitMarginTTM,
    clamp(bandScore(metrics.netProfitMarginTTM, 20, 8, 2, -5)),
    "NM"
  );
  add(metrics.roeTTM, clamp(bandScore(metrics.roeTTM, 20, 10, 5, 0)), "ROE");
  add(
    metrics["52WeekPriceReturnDaily"],
    clamp(bandScore(metrics["52WeekPriceReturnDaily"], 30, 8, -5, -25)),
    "52w"
  );

  const de = metrics["totalDebt/totalEquityQuarterly"];
  if (de != null && Number.isFinite(de)) {
    parts.push({ score: clamp(bandScore(-de, -0.3, -0.8, -1.5, -3)), note: "D/E" });
  }
  add(
    metrics.currentRatioQuarterly,
    clamp(bandScore(metrics.currentRatioQuarterly, 2, 1.3, 1, 0.7)),
    "CR"
  );

  const pe = metrics.forwardPE || metrics.peTTM;
  if (pe != null && Number.isFinite(pe)) {
    if (pe < 0) parts.push({ score: -0.35, note: "P/E âm" });
    else if (pe < 12) parts.push({ score: 0.25, note: "P/E thấp" });
    else if (pe < 22) parts.push({ score: 0.08, note: "P/E vừa" });
    else if (pe < 35) parts.push({ score: -0.08, note: "P/E cao" });
    else parts.push({ score: -0.3, note: "P/E rất cao" });
  }

  const ret50 = metrics["50DayPriceReturnDaily"];
  const ret200 = metrics["200DayPriceReturnDaily"];
  if (ret50 != null && ret200 != null && Number.isFinite(ret50) && Number.isFinite(ret200)) {
    parts.push({
      score: ret50 > ret200 ? 0.2 : -0.2,
      note: ret50 > ret200 ? "trend 50>200" : "trend 50<200",
    });
  }

  if (!parts.length) {
    return {
      id: "fundamental",
      label: "Cơ bản",
      score: 0,
      detail: "Không đủ chỉ số",
      available: false,
    };
  }

  const score = clamp(parts.reduce((s, p) => s + p.score, 0) / parts.length);
  const positive = parts.filter((p) => p.score > 0.05).length;
  return {
    id: "fundamental",
    label: "Cơ bản",
    score,
    detail: `${positive}/${parts.length} nhóm tích cực` + (pe != null && Number.isFinite(pe) ? ` · P/E ${pe.toFixed(1)}` : ""),
    available: true,
  };
}

function newsSignal(news: NewsRow[]): AssessmentSignal {
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

  const twoDays = Date.now() - 2 * 24 * 3600 * 1000;
  let net = 0;
  let classified = 0;
  for (const n of recent) {
    const pos = POSITIVE_NEWS.test(n.headline);
    const neg = NEGATIVE_NEWS.test(n.headline);
    if (pos === neg) continue;
    const weight = new Date(n.date).getTime() >= twoDays ? 1.4 : 1;
    net += (pos ? 1 : -1) * weight;
    classified += 1;
  }

  if (!classified) {
    return {
      id: "news",
      label: "Tin tức (7 ngày)",
      score: 0,
      detail: `${recent.length} tin · chưa rõ thiên hướng`,
      available: true,
    };
  }

  const score = clamp(net / Math.max(classified, 1));
  return {
    id: "news",
    label: "Tin tức (7 ngày)",
    score,
    detail: `${recent.length} tin · ${classified} có hướng · ${net >= 0 ? "+" : ""}${net.toFixed(0)}`,
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
  if (ratio < 0.7) score = 0.8;
  else if (ratio < 0.9) score = 0.4;
  else if (ratio > 1.3) score = -0.8;
  else if (ratio > 1.1) score = -0.4;

  return {
    id: "options",
    label: "Option flow",
    score,
    detail: `P/C ${ratio.toFixed(2)} · C ${flow.callVolume.toLocaleString("vi-VN")} / P ${flow.putVolume.toLocaleString("vi-VN")}`,
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
  return {
    id: "insider",
    label: "Insider",
    score: clamp(net * 1.15),
    detail: `Mở TT net ${net >= 0 ? "+" : ""}${(net * 100).toFixed(0)}%${ignored ? ` · ${ignored} grant/tax bỏ` : ""}`,
    available: true,
  };
}

function technicalSignal(price: number, levels: PriceLevels): AssessmentSignal {
  const supports = levels.support.map((s) => s.price).filter((p) => p < price);
  const resistances = levels.resistance.map((r) => r.price).filter((p) => p > price);
  const fair = levels.targetFundamental?.price;
  const analyst = levels.targetAnalyst?.price;

  let score = 0;
  const parts: string[] = [];

  if (supports.length) {
    const nearest = Math.max(...supports);
    const dist = (price - nearest) / price;
    score += clamp(0.4 - dist * 3.2, -0.25, 0.45);
    if (dist < 0.03) parts.push("gần hỗ trợ");
  }

  if (resistances.length) {
    const nearest = Math.min(...resistances);
    const dist = (nearest - price) / price;
    score += clamp(dist * 2.2 - 0.28, -0.45, 0.22);
    if (dist < 0.03) parts.push("gần kháng cự");
  }

  const low52 = levels.support.find((s) => s.label.includes("52"))?.price;
  const high52 = levels.resistance.find((r) => r.label.includes("52"))?.price;
  if (low52 && high52 && high52 > low52) {
    const pos = (price - low52) / (high52 - low52);
    if (pos > 0.92) {
      score -= 0.12;
      parts.push("sát đỉnh 52w");
    } else if (pos < 0.12) {
      score += 0.08;
      parts.push("gần đáy 52w");
    }
  }

  if (fair) {
    const upside = (fair - price) / price;
    score += clamp(upside * 1.6, -0.45, 0.45);
    parts.push(`hợp lý ${upside >= 0 ? "+" : ""}${(upside * 100).toFixed(0)}%`);
  }

  if (analyst) {
    const upside = (analyst - price) / price;
    score += clamp(upside, -0.3, 0.3) * 0.45;
  }

  return {
    id: "technical",
    label: "Kỹ thuật & mức giá",
    score: clamp(score),
    detail: parts.length ? parts.join(" · ") : "Trung lập",
    available: true,
  };
}

function recommendationSignal(rows: RecommendationRow[]): AssessmentSignal {
  const latest = rows[0];
  if (!latest) {
    return {
      id: "recs",
      label: "Khuyến nghị",
      score: 0,
      detail: "Không có dữ liệu",
      available: false,
    };
  }
  const total =
    latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  if (!total) {
    return {
      id: "recs",
      label: "Khuyến nghị",
      score: 0,
      detail: "Không có dữ liệu",
      available: false,
    };
  }
  const bullish = latest.strongBuy * 2 + latest.buy;
  const bearish = latest.sell + latest.strongSell * 2;
  const score = clamp((bullish - bearish) / (total * 2));
  return {
    id: "recs",
    label: "Khuyến nghị",
    score,
    detail: `${total} CTCK · Mua ${latest.strongBuy + latest.buy} · Giữ ${latest.hold} · Bán ${latest.sell + latest.strongSell}`,
    available: true,
  };
}

function nearestBelow(levels: number[], price: number): number | undefined {
  const below = levels.filter((p) => p > 0 && p < price * 0.998).sort((a, b) => b - a);
  return below[0];
}

function nearestAbove(levels: number[], price: number): number | undefined {
  const above = levels.filter((p) => p > price * 1.002).sort((a, b) => a - b);
  return above[0];
}

function computeBuySellPrices(price: number, levels: PriceLevels): {
  buyPrice: number;
  sellPrice: number;
} {
  const supports = levels.support.map((s) => s.price);
  const resistances = levels.resistance.map((r) => r.price);
  const fair = levels.targetFundamental?.price;

  let buyPrice = nearestBelow(supports, price) ?? price * 0.98;
  if (fair && fair < price && fair < buyPrice) {
    buyPrice = (buyPrice * 0.7 + fair * 0.3);
  }
  if (buyPrice >= price) buyPrice = price * 0.99;

  let sellPrice = nearestAbove(resistances, price) ?? price * 1.03;
  if (sellPrice <= price) sellPrice = price * 1.01;

  return { buyPrice, sellPrice };
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  fundamental: 0.28,
  technical: 0.22,
  news: 0.12,
  insider: 0.14,
  options: 0.14,
  recs: 0.1,
};

export function computeStockAssessment(input: {
  price: number;
  metrics: Record<string, number>;
  news: NewsRow[];
  insiderTransactions: InsiderRow[];
  recommendations: RecommendationRow[];
  priceLevels: PriceLevels;
  optionFlow?: OptionFlowSummary | null;
}): StockAssessment {
  const signals: AssessmentSignal[] = [
    fundamentalSignal(input.metrics),
    technicalSignal(input.price, input.priceLevels),
    newsSignal(input.news),
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

  const score = displayScore(weighted);
  const rating = scoreToRating(score);
  const { buyPrice, sellPrice } = computeBuySellPrices(input.price, input.priceLevels);

  return {
    rating,
    label: RATING_LABELS[rating],
    score,
    buyPrice,
    sellPrice,
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
