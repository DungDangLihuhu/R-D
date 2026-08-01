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
  label: string;
  score: number;
  detail: string;
}

export interface OptionFlowSummary {
  callVolume: number;
  putVolume: number;
  putCallRatio: number;
}

export interface StockAssessment {
  rating: AssessmentRating;
  label: string;
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

function clamp(n: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function scoreToRating(score: number): AssessmentRating {
  if (score >= 40) return "strong_buy";
  if (score >= 15) return "buy";
  if (score > -15) return "hold";
  if (score > -40) return "sell";
  return "strong_sell";
}

function fundamentalSignal(
  metrics: Record<string, number>
): AssessmentSignal {
  const checks: { v?: number; pos: (n: number) => boolean }[] = [
    { v: metrics.epsGrowthTTMYoy, pos: (n) => n > 0 },
    { v: metrics.revenueGrowthTTMYoy, pos: (n) => n > 0 },
    { v: metrics.grossMarginTTM, pos: (n) => n >= 30 },
    { v: metrics.netProfitMarginTTM, pos: (n) => n >= 5 },
    { v: metrics.roeTTM, pos: (n) => n >= 10 },
    { v: metrics["52WeekPriceReturnDaily"], pos: (n) => n > 0 },
    { v: metrics["totalDebt/totalEquityQuarterly"], pos: (n) => n <= 1 },
    { v: metrics.currentRatioQuarterly, pos: (n) => n >= 1 },
  ];

  let hits = 0;
  let total = 0;
  for (const c of checks) {
    if (c.v == null || !Number.isFinite(c.v)) continue;
    total += 1;
    if (c.pos(c.v)) hits += 1;
  }

  const ratio = total ? hits / total : 0.5;
  const score = clamp((ratio - 0.5) * 2);
  return {
    label: "Cơ bản",
    score,
    detail: `${hits}/${total} chỉ số tích cực`,
  };
}

function newsSignal(news: NewsRow[]): AssessmentSignal {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = news.filter((n) => new Date(n.date).getTime() >= weekAgo);
  if (!recent.length) {
    return { label: "Tin tức (7 ngày)", score: 0, detail: "Không có tin gần đây" };
  }

  let net = 0;
  for (const n of recent) {
    const pos = POSITIVE_NEWS.test(n.headline);
    const neg = NEGATIVE_NEWS.test(n.headline);
    if (pos && !neg) net += 1;
    else if (neg && !pos) net -= 1;
  }

  const score = clamp(net / Math.max(recent.length, 1));
  return {
    label: "Tin tức (7 ngày)",
    score,
    detail: `${recent.length} tin · ${net >= 0 ? "+" : ""}${net} thiên hướng`,
  };
}

function optionFlowSignal(flow: OptionFlowSummary | null | undefined): AssessmentSignal {
  if (!flow || flow.callVolume + flow.putVolume === 0) {
    return { label: "Option flow", score: 0, detail: "Không có dữ liệu" };
  }
  const ratio = flow.putCallRatio;
  let score = 0;
  if (ratio < 0.7) score = 0.8;
  else if (ratio < 0.9) score = 0.4;
  else if (ratio > 1.3) score = -0.8;
  else if (ratio > 1.1) score = -0.4;

  return {
    label: "Option flow",
    score,
    detail: `P/C ${ratio.toFixed(2)} · C ${flow.callVolume.toLocaleString("vi-VN")} / P ${flow.putVolume.toLocaleString("vi-VN")}`,
  };
}

function insiderSignal(transactions: InsiderRow[]): AssessmentSignal {
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const recent = transactions.filter((t) => new Date(t.date).getTime() >= cutoff);
  if (!recent.length) {
    return { label: "Insider", score: 0, detail: "Không có GD nội bộ 90 ngày" };
  }

  const netShares = recent.reduce((s, t) => s + t.change, 0);
  const netAmount = recent.reduce((s, t) => s + (t.amount ?? 0), 0);
  let score = 0;
  if (netShares > 0) score = 0.6;
  else if (netShares < 0) score = -0.6;
  if (netAmount > 0) score = Math.max(score, 0.4);
  else if (netAmount < 0) score = Math.min(score, -0.4);

  return {
    label: "Insider",
    score: clamp(score),
    detail: `${netShares >= 0 ? "+" : ""}${netShares.toLocaleString("vi-VN")} cp (90 ngày)`,
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
    if (dist < 0.03) {
      score += 0.4;
      parts.push("gần hỗ trợ");
    } else if (dist > 0.15) {
      score -= 0.2;
    }
  }

  if (resistances.length) {
    const nearest = Math.min(...resistances);
    const dist = (nearest - price) / price;
    if (dist < 0.03) {
      score -= 0.4;
      parts.push("gần kháng cự");
    }
  }

  if (fair) {
    const upside = (fair - price) / price;
    score += clamp(upside * 2, -0.5, 0.5);
    parts.push(`hợp lý ${upside >= 0 ? "+" : ""}${(upside * 100).toFixed(0)}%`);
  }

  if (analyst) {
    const upside = (analyst - price) / price;
    score += clamp(upside, -0.3, 0.3) * 0.5;
  }

  return {
    label: "Kỹ thuật & mức giá",
    score: clamp(score),
    detail: parts.length ? parts.join(" · ") : "Trung lập",
  };
}

function recommendationSignal(rows: RecommendationRow[]): AssessmentSignal {
  const latest = rows[0];
  if (!latest) {
    return { label: "Khuyến nghị", score: 0, detail: "Không có dữ liệu" };
  }
  const total =
    latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
  if (!total) {
    return { label: "Khuyến nghị", score: 0, detail: "Không có dữ liệu" };
  }
  const bullish = latest.strongBuy * 2 + latest.buy;
  const bearish = latest.sell + latest.strongSell * 2;
  const score = clamp((bullish - bearish) / (total * 2));
  return {
    label: "Khuyến nghị",
    score,
    detail: `Mua ${latest.strongBuy + latest.buy} · Giữ ${latest.hold} · Bán ${latest.sell + latest.strongSell}`,
  };
}

function computeBuySellPrices(price: number, levels: PriceLevels): {
  buyPrice: number;
  sellPrice: number;
} {
  const supports = levels.support.map((s) => s.price).filter((p) => p > 0 && p < price);
  const resistances = levels.resistance.map((r) => r.price).filter((p) => p > price);
  const fair = levels.targetFundamental?.price;
  const analyst = levels.targetAnalyst?.price;

  const nearestSupport = supports.length > 0 ? Math.max(...supports) : undefined;
  const buyCandidates: number[] = [];
  if (fair && fair > 0) buyCandidates.push(fair);
  if (nearestSupport) buyCandidates.push(nearestSupport);

  let buyPrice =
    buyCandidates.length > 0
      ? buyCandidates.reduce((a, b) => a + b, 0) / buyCandidates.length
      : price * 0.97;
  buyPrice = Math.min(buyPrice, price * 0.995);

  let sellPrice =
    resistances.length > 0
      ? resistances.reduce((a, b) => a + b, 0) / resistances.length
      : price * 1.03;

  const targets = [analyst, fair].filter((t): t is number => t != null && t > price);
  if (targets.length) {
    sellPrice = Math.max(sellPrice, targets.reduce((a, b) => a + b, 0) / targets.length);
  }
  sellPrice = Math.max(sellPrice, price * 1.005);

  return { buyPrice, sellPrice };
}

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
    newsSignal(input.news),
    optionFlowSignal(input.optionFlow),
    insiderSignal(input.insiderTransactions),
    technicalSignal(input.price, input.priceLevels),
    recommendationSignal(input.recommendations),
  ];

  const weights = [0.25, 0.15, 0.15, 0.15, 0.2, 0.1];
  let weighted = 0;
  let weightSum = 0;
  signals.forEach((s, i) => {
    if (s.label === "Option flow" && s.detail === "Không có dữ liệu") return;
    weighted += s.score * weights[i];
    weightSum += weights[i];
  });
  if (weightSum > 0) weighted /= weightSum;

  const score = Math.round(weighted * 100);
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
