import { getFinnhubApiKey } from "./quote-config";
import { resolveYahooSymbolCandidates } from "./symbol";
import { fetchPriceHistory, fetchQuoteForSymbol } from "./yahoo";

export interface AnalysisMetric {
  label: string;
  value: string;
}

export interface AnalysisSection {
  id: string;
  title: string;
  metrics: AnalysisMetric[];
}

export interface EarningsRow {
  period: string;
  estimate: number | null;
  actual: number | null;
  surprisePercent: number | null;
}

export interface InsiderRow {
  name: string;
  date: string;
  change: number;
  shares: number;
  transactionCode: string;
}

export interface NewsRow {
  headline: string;
  date: string;
  source?: string;
  url?: string;
}

export interface RecommendationRow {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export interface PriceLevelLine {
  price: number;
  label: string;
}

export interface PriceTarget {
  price: number;
  upsidePercent: number;
  method: string;
}

export interface PriceLevels {
  targetAnalyst?: PriceTarget;
  targetFundamental?: PriceTarget;
  support: PriceLevelLine[];
  resistance: PriceLevelLine[];
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  exchange?: string;
  country?: string;
  currency: string;
  logo?: string;
  website?: string;
  ipo?: string;
  peers: string[];
  price: number;
  change: number;
  changePercent: number;
  high52?: number;
  low52?: number;
  sections: AnalysisSection[];
  earningsHistory: EarningsRow[];
  earningsUpcoming: {
    date: string;
    hour?: string;
    quarter?: number;
    year?: number;
    epsEstimate?: number | null;
  }[];
  recommendations: RecommendationRow[];
  insiderTransactions: InsiderRow[];
  news: NewsRow[];
  priceHistory: { date: string; close: number }[];
  priceLevels: PriceLevels;
  sources: string[];
  note?: string;
}

async function finnhubGet<T>(path: string, symbol: string): Promise<T | null> {
  const key = getFinnhubApiKey();
  if (!key) return null;
  for (const sym of resolveYahooSymbolCandidates(symbol)) {
    const url = `https://finnhub.io/api/v1/${path}${path.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(sym)}&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) continue;
    const data = (await res.json()) as T & { error?: string };
    if (data && typeof data === "object" && "error" in data && data.error) continue;
    if (data && typeof data === "object" && Object.keys(data as object).length === 0) continue;
    return data;
  }
  return null;
}

function metric(label: string, value: string | number | null | undefined, suffix = ""): AnalysisMetric {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) {
    return { label, value: "—" };
  }
  return { label, value: `${value}${suffix}` };
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

function num(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function capMillions(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  const usd = m * 1_000_000;
  if (usd >= 1e12) return `${(usd / 1e12).toFixed(2)}T`;
  if (usd >= 1e9) return `${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `${(usd / 1e6).toFixed(2)}M`;
  return usd.toFixed(0);
}

function clusterLevels(
  prices: number[],
  tolerancePct = 0.02
): { price: number; touches: number }[] {
  if (!prices.length) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const clusters: { sum: number; count: number }[] = [];

  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.sum / last.count) / (last.sum / last.count) <= tolerancePct) {
      last.sum += p;
      last.count += 1;
    } else {
      clusters.push({ sum: p, count: 1 });
    }
  }

  return clusters
    .map((c) => ({ price: c.sum / c.count, touches: c.count }))
    .sort((a, b) => b.touches - a.touches || a.price - b.price);
}

function findSwingLevels(
  history: { date: string; close: number }[],
  window = 5
): { lows: number[]; highs: number[] } {
  const lows: number[] = [];
  const highs: number[] = [];
  if (history.length < window * 2 + 1) return { lows, highs };

  for (let i = window; i < history.length - window; i++) {
    const slice = history.slice(i - window, i + window + 1).map((h) => h.close);
    const c = history[i].close;
    if (c === Math.min(...slice)) lows.push(c);
    if (c === Math.max(...slice)) highs.push(c);
  }

  return { lows, highs };
}

function computePriceLevels(
  price: number,
  metrics: Record<string, number>,
  priceHistory: { date: string; close: number }[],
  recommendations: RecommendationRow[],
  earningsUpcoming: StockAnalysis["earningsUpcoming"]
): PriceLevels {
  const levels: PriceLevels = { support: [], resistance: [] };
  if (!Number.isFinite(price) || price <= 0) return levels;

  const saneTarget = (target: number) =>
    Number.isFinite(target) && target > 0 && target >= price * 0.2 && target <= price * 5;

  const epsTtm = metrics.epsTTM;
  const forwardPe = metrics.forwardPE;
  const peTtm = metrics.peTTM;

  if (epsTtm && forwardPe && epsTtm > 0 && forwardPe > 0) {
    const target = epsTtm * forwardPe;
    if (saneTarget(target)) {
      levels.targetFundamental = {
        price: target,
        upsidePercent: ((target - price) / price) * 100,
        method: "EPS TTM × P/E Forward",
      };
    }
  } else if (epsTtm && peTtm && epsTtm > 0 && peTtm > 0) {
    const target = epsTtm * peTtm;
    if (saneTarget(target)) {
      levels.targetFundamental = {
        price: target,
        upsidePercent: ((target - price) / price) * 100,
        method: "EPS TTM × P/E TTM",
      };
    }
  }

  const latestRec = recommendations[0];
  if (latestRec) {
    const total =
      latestRec.strongBuy +
      latestRec.buy +
      latestRec.hold +
      latestRec.sell +
      latestRec.strongSell;
    if (total > 0) {
      const score =
        (latestRec.strongBuy * 2 +
          latestRec.buy -
          latestRec.sell -
          latestRec.strongSell * 2) /
        (total * 2);
      const consensusTarget = price * (1 + score * 0.25);
      levels.targetAnalyst = {
        price: consensusTarget,
        upsidePercent: ((consensusTarget - price) / price) * 100,
        method: `Khuyến nghị ${latestRec.period}`,
      };
    }
  }

  const nextEps = earningsUpcoming[0]?.epsEstimate;
  if (nextEps && forwardPe && nextEps > 0 && forwardPe > 0) {
    const implied = nextEps * 4 * forwardPe;
    if (saneTarget(implied)) {
      if (levels.targetAnalyst) {
        const blended = (levels.targetAnalyst.price + implied) / 2;
        if (saneTarget(blended)) {
          levels.targetAnalyst = {
            price: blended,
            upsidePercent: ((blended - price) / price) * 100,
            method: "Khuyến nghị + EPS dự báo × P/E Forward",
          };
        }
      } else {
        levels.targetAnalyst = {
          price: implied,
          upsidePercent: ((implied - price) / price) * 100,
          method: "EPS dự báo (annualized) × P/E Forward",
        };
      }
    }
  }

  const high52 = metrics["52WeekHigh"];
  const low52 = metrics["52WeekLow"];
  const { lows, highs } = findSwingLevels(priceHistory);

  const supportCandidates = clusterLevels(lows)
    .filter((c) => c.price < price * 0.995)
    .slice(0, 3);
  const resistanceCandidates = clusterLevels(highs)
    .filter((c) => c.price > price * 1.005)
    .slice(0, 3);

  levels.support = supportCandidates.map((c, i) => ({
    price: c.price,
    label: `Hỗ trợ ${i + 1}`,
  }));

  levels.resistance = resistanceCandidates.map((c, i) => ({
    price: c.price,
    label: `Kháng cự ${i + 1}`,
  }));

  if (low52 && low52 < price && !levels.support.some((s) => Math.abs(s.price - low52) / low52 < 0.02)) {
    levels.support.push({ price: low52, label: "Thấp 52 tuần" });
    levels.support.sort((a, b) => b.price - a.price);
  }

  if (high52 && high52 > price && !levels.resistance.some((r) => Math.abs(r.price - high52) / high52 < 0.02)) {
    levels.resistance.push({ price: high52, label: "Cao 52 tuần" });
    levels.resistance.sort((a, b) => a.price - b.price);
  }

  levels.support = levels.support.slice(0, 4);
  levels.resistance = levels.resistance.slice(0, 4);

  return levels;
}

function buildSections(
  m: Record<string, number>,
  profile: {
    marketCapitalization?: number;
    shareOutstanding?: number;
  }
): AnalysisSection[] {
  const revenueTtm =
    m.revenuePerShareTTM && profile.shareOutstanding
      ? m.revenuePerShareTTM * profile.shareOutstanding * 1_000_000
      : null;

  return [
    {
      id: "overview",
      title: "Tổng quan",
      metrics: [
        metric("Vốn hóa", capMillions(profile.marketCapitalization ?? m.marketCapitalization)),
        metric("Doanh thu TTM", revenueTtm != null ? capMillions(revenueTtm / 1_000_000) : "—"),
        metric("EPS TTM", num(m.epsTTM)),
        metric("EPS tăng Y/Y", pct(m.epsGrowthTTMYoy)),
        metric("Doanh thu tăng Y/Y", pct(m.revenueGrowthTTMYoy)),
        metric("Cổ tức/năm", num(m.dividendPerShareTTM, 4)),
        metric("Tỷ suất cổ tức", pct(m.dividendYieldIndicatedAnnual)),
        metric("Tiền mặt/CP", num(m.cashPerSharePerShareQuarterly)),
        metric("Beta", num(m.beta)),
        metric("Nhân viên (doanh thu/NV)", num(m.revenueEmployeeTTM)),
      ],
    },
    {
      id: "valuation",
      title: "Định giá",
      metrics: [
        metric("P/E TTM", num(m.peTTM)),
        metric("P/E Forward", num(m.forwardPE)),
        metric("PEG TTM", num(m.pegTTM)),
        metric("P/S (EV/Revenue)", num(m.evRevenueTTM)),
        metric("P/B", num(m.pb)),
        metric("P/FCF TTM", num(m.pfcfShareTTM)),
        metric("EV/EBITDA TTM", num(m.evEbitdaTTM)),
        metric("Thanh toán hiện hành", num(m.currentRatioQuarterly)),
        metric("Nợ/VCSH", num(m["totalDebt/totalEquityQuarterly"])),
        metric("Nợ dài hạn/VCSH", num(m["longTermDebt/equityQuarterly"])),
      ],
    },
    {
      id: "profitability",
      title: "Lợi nhuận",
      metrics: [
        metric("Biên gộp TTM", pct(m.grossMarginTTM)),
        metric("Biên hoạt động TTM", pct(m.operatingMarginTTM)),
        metric("Biên ròng TTM", pct(m.netProfitMarginTTM)),
        metric("ROE TTM", pct(m.roeTTM)),
        metric("ROE 5Y", pct(m.roe5Y)),
        metric("EPS Q/Q Y/Y", pct(m.epsGrowthQuarterlyYoy)),
        metric("Doanh thu Q/Q Y/Y", pct(m.revenueGrowthQuarterlyYoy)),
        metric("EPS tăng 3Y", pct(m.epsGrowth3Y)),
        metric("EPS tăng 5Y", pct(m.epsGrowth5Y)),
        metric("Tỷ lệ trả cổ tức", pct((m.payoutRatioTTM ?? 0) * 100)),
      ],
    },
    {
      id: "price",
      title: "Giá & thanh khoản",
      metrics: [
        metric("Cao 52 tuần", num(m["52WeekHigh"])),
        metric("Thấp 52 tuần", num(m["52WeekLow"])),
        metric("Lợi nhuận 52 tuần", pct(m["52WeekPriceReturnDaily"])),
        metric("Lợi nhuận 3 tháng", pct(m["13WeekPriceReturnDaily"])),
        metric("KL TB 10 ngày", num(m["10DayAverageTradingVolume"], 0)),
        metric("KL TB 3 tháng", num(m["3MonthAverageTradingVolume"], 0)),
        metric("Độ biến động 3 tháng", pct(m["3MonthADReturnStd"])),
      ],
    },
  ];
}

export async function fetchStockAnalysis(symbol: string): Promise<StockAnalysis | null> {
  const upper = symbol.trim().toUpperCase();
  if (!upper || upper === "CASH") return null;

  const quote = await fetchQuoteForSymbol(upper);
  if (!quote) return null;

  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const priceHistory = await fetchPriceHistory(upper, from, new Date());

  const sources: string[] = ["Yahoo Finance"];
  let note: string | undefined;

  const profile = await finnhubGet<{
    name?: string;
    ticker?: string;
    exchange?: string;
    country?: string;
    currency?: string;
    logo?: string;
    weburl?: string;
    ipo?: string;
    marketCapitalization?: number;
    shareOutstanding?: number;
    finnhubIndustry?: string;
  }>("stock/profile2?", upper);

  const metricsRes = await finnhubGet<{ metric?: Record<string, number> }>(
    "stock/metric?metric=all&",
    upper
  );

  if (profile) sources.push("Finnhub");
  else if (upper.includes(".")) {
    note =
      "Finnhub free chủ yếu hỗ trợ mã US — chỉ số cơ bản có thể thiếu với mã .PA.";
  }

  const m = metricsRes?.metric ?? {};
  const sections: AnalysisSection[] = metricsRes
    ? buildSections(m, profile ?? {})
    : [];

  if (profile?.finnhubIndustry && sections[0]) {
    sections[0].metrics.unshift(metric("Ngành", profile.finnhubIndustry));
  }

  if (sections.length === 0) {
    sections.push({
      id: "overview",
      title: "Tổng quan",
      metrics: [
        metric("Giá", num(quote.price)),
        metric("Thay đổi", pct(quote.changePercent)),
        metric("Cao 52 tuần", quote.price ? num(quote.price) : "—"),
      ],
    });
  }

  const earningsHist = await finnhubGet<
    { period: string; estimate?: number; actual?: number; surprisePercent?: number }[]
  >("stock/earnings?", upper);

  const now = new Date();
  const calFrom = now.toISOString().slice(0, 10);
  const calTo = new Date(now.getTime() + 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const key = getFinnhubApiKey();
  let earningsUpcoming: StockAnalysis["earningsUpcoming"] = [];
  if (key) {
    for (const sym of resolveYahooSymbolCandidates(upper)) {
      const res = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(sym)}&from=${calFrom}&to=${calTo}&token=${key}`,
        { next: { revalidate: 3600 } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        earningsCalendar?: StockAnalysis["earningsUpcoming"];
      };
      if (data.earningsCalendar?.length) {
        earningsUpcoming = data.earningsCalendar;
        break;
      }
    }
  }

  const recommendations =
    (await finnhubGet<RecommendationRow[]>("stock/recommendation?", upper)) ?? [];

  const insiderRes = await finnhubGet<{
    data?: {
      name: string;
      share: number;
      change: number;
      transactionDate: string;
      transactionCode: string;
    }[];
  }>("stock/insider-transactions?", upper);

  const peers = (await finnhubGet<string[]>("stock/peers?", upper)) ?? [];

  const fromNews = new Date();
  fromNews.setDate(fromNews.getDate() - 30);
  let news: NewsRow[] = [];
  if (key) {
    for (const sym of resolveYahooSymbolCandidates(upper)) {
      const res = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}&from=${fromNews.toISOString().slice(0, 10)}&to=${now.toISOString().slice(0, 10)}&token=${key}`,
        { next: { revalidate: 1800 } }
      );
      if (!res.ok) continue;
      const items = (await res.json()) as {
        datetime: number;
        headline: string;
        source?: string;
        url?: string;
      }[];
      if (!Array.isArray(items) || !items.length) continue;
      news = items.slice(0, 15).map((n) => ({
        headline: n.headline,
        date: new Date(n.datetime * 1000).toISOString(),
        source: n.source,
        url: n.url,
      }));
      break;
    }
  }

  return {
    symbol: upper,
    name: profile?.name ?? quote.shortName ?? upper,
    exchange: profile?.exchange ?? quote.exchangeName,
    country: profile?.country,
    currency: quote.currency ?? profile?.currency ?? "USD",
    logo: profile?.logo,
    website: profile?.weburl,
    ipo: profile?.ipo,
    peers: peers.filter((p) => p !== upper).slice(0, 8),
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    high52: m["52WeekHigh"] ?? undefined,
    low52: m["52WeekLow"] ?? undefined,
    sections,
    earningsHistory: (earningsHist ?? []).slice(0, 8).map((e) => ({
      period: e.period,
      estimate: e.estimate ?? null,
      actual: e.actual ?? null,
      surprisePercent: e.surprisePercent ?? null,
    })),
    earningsUpcoming: earningsUpcoming.slice(0, 4),
    recommendations: recommendations.slice(0, 6),
    insiderTransactions: (insiderRes?.data ?? []).slice(0, 12).map((t) => ({
      name: t.name,
      date: t.transactionDate,
      change: t.change,
      shares: t.share,
      transactionCode: t.transactionCode,
    })),
    news,
    priceHistory,
    priceLevels: computePriceLevels(
      quote.price,
      m,
      priceHistory,
      recommendations,
      earningsUpcoming
    ),
    sources,
    note,
  };
}
