import { getFinnhubApiKey } from "./quote-config";
import { resolveYahooSymbolCandidates } from "./symbol";
import { fetchPriceHistory, fetchQuoteForSymbol, fetchYahooInsiderData, fetchYahooOptionFlow, yahooInsiderShareChange } from "./yahoo";
import type { YahooInsiderData } from "./yahoo";
import {
  computeStockAssessment,
  type OptionFlowSummary,
  type StockAssessment,
} from "./stock-assessment";

export interface AnalysisMetric {
  label: string;
  value: string;
  tone?: "positive" | "negative";
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
  transactionPrice?: number | null;
  amount?: number | null;
  relationship?: string | null;
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
  assessment: StockAssessment;
  /** Finnhub metrics — dùng cho lazy extra / assessment */
  metrics?: Record<string, number>;
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

async function fetchOptionFlow(symbol: string): Promise<OptionFlowSummary | null> {
  const yahoo = await fetchYahooOptionFlow(symbol);
  if (yahoo && yahoo.callVolume + yahoo.putVolume > 0) {
    return { ...yahoo, source: "yahoo" };
  }

  const chain = await finnhubGet<{
    data?: {
      options?: {
        CALL?: { volume?: number; openInterest?: number }[];
        PUT?: { volume?: number; openInterest?: number }[];
      };
    }[];
  }>("stock/option-chain?", symbol);

  if (!chain?.data?.length) return null;

  let callVolume = 0;
  let putVolume = 0;
  for (const expiry of chain.data.slice(0, 4)) {
    for (const c of expiry.options?.CALL ?? []) {
      callVolume += c.volume ?? c.openInterest ?? 0;
    }
    for (const p of expiry.options?.PUT ?? []) {
      putVolume += p.volume ?? p.openInterest ?? 0;
    }
  }

  if (callVolume + putVolume === 0) return null;
  return {
    callVolume,
    putVolume,
    putCallRatio: callVolume > 0 ? putVolume / callVolume : 0,
    source: "finnhub",
  };
}

function metric(label: string, value: string | number | null | undefined, suffix = ""): AnalysisMetric {
  if (value == null || value === "" || (typeof value === "number" && !Number.isFinite(value))) {
    return { label, value: "—" };
  }
  return { label, value: `${value}${suffix}` };
}

function signedMetric(
  label: string,
  value: number | null | undefined,
  format: (v: number) => string
): AnalysisMetric {
  const m = metric(label, value != null && Number.isFinite(value) ? format(value) : "—");
  if (value != null && Number.isFinite(value)) {
    if (value > 0) m.tone = "positive";
    else if (value < 0) m.tone = "negative";
  }
  return m;
}

function positiveIfAbove(
  label: string,
  value: number | null | undefined,
  format: (v: number) => string,
  threshold: number
): AnalysisMetric {
  const m = metric(label, value != null && Number.isFinite(value) ? format(value) : "—");
  if (value != null && Number.isFinite(value)) {
    if (value >= threshold) m.tone = "positive";
    else m.tone = "negative";
  }
  return m;
}

function debtMetric(label: string, value: number | null | undefined): AnalysisMetric {
  const m = metric(label, num(value));
  if (value != null && Number.isFinite(value)) {
    if (value <= 0.5) m.tone = "positive";
    else if (value > 1) m.tone = "negative";
  }
  return m;
}

function volatilityMetric(label: string, value: number | null | undefined): AnalysisMetric {
  const m = metric(label, pct(value));
  if (value != null && Number.isFinite(value)) {
    if (value <= 25) m.tone = "positive";
    else if (value > 40) m.tone = "negative";
  }
  return m;
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

/** Số năm EPS (có tăng trưởng) cần để hoàn vốn giá hiện tại. Không tăng trưởng thì = P/E. */
function earningsPaybackYears(
  pe: number | undefined,
  growthPct: number | undefined
): number | undefined {
  if (pe == null || !Number.isFinite(pe) || pe <= 0) return undefined;
  const g = growthPct != null && Number.isFinite(growthPct) ? growthPct / 100 : 0;
  if (g > 0.005 && g < 1.5) {
    const n = Math.log(1 + pe * g) / Math.log(1 + g);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return pe;
}

function pegMetric(label: string, peg: number | undefined): AnalysisMetric {
  if (peg == null || !Number.isFinite(peg) || peg <= 0) return metric(label, "—");
  const m = metric(label, num(peg));
  if (peg <= 1.2) m.tone = "positive";
  else if (peg >= 2.5) m.tone = "negative";
  return m;
}

function yearsMetric(
  label: string,
  years: number | undefined,
  goodMax: number,
  badMin: number
): AnalysisMetric {
  if (years == null || !Number.isFinite(years) || years <= 0) return metric(label, "—");
  const m = metric(label, years > 80 ? ">80 năm" : `${years.toFixed(1)} năm`);
  if (years <= goodMax) m.tone = "positive";
  else if (years >= badMin) m.tone = "negative";
  return m;
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

function normalizePersonName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z]/g, "");
}

function matchExecutivePosition(
  name: string,
  executives: { name: string; position?: string }[]
): string | undefined {
  const norm = normalizePersonName(name);
  if (!norm) return undefined;

  for (const ex of executives) {
    const exNorm = normalizePersonName(ex.name);
    if (!exNorm || !ex.position) continue;
    if (norm === exNorm || norm.includes(exNorm) || exNorm.includes(norm)) {
      return ex.position;
    }

    const parts = name.toUpperCase().split(/[\s,.-]+/).filter(Boolean);
    const exParts = ex.name.toUpperCase().split(/[\s,.-]+/).filter(Boolean);
    if (parts.length >= 2 && exParts.length >= 2) {
      const last = parts[parts.length - 1];
      const exLast = exParts[exParts.length - 1];
      if (last === exLast && parts[0][0] === exParts[0][0]) {
        return ex.position;
      }
    }
  }

  return undefined;
}

function lookupYahooRelationship(
  name: string,
  date: string,
  yahoo: YahooInsiderData | null
): string | undefined {
  if (!yahoo) return undefined;
  const key = normalizePersonName(name);
  const day = date.slice(0, 10);

  for (const t of yahoo.transactions) {
    if (t.date.slice(0, 10) !== day) continue;
    const tKey = normalizePersonName(t.name);
    if (tKey === key || tKey.includes(key) || key.includes(tKey)) {
      if (t.relation) return t.relation;
    }
  }

  for (const t of yahoo.transactions) {
    const tKey = normalizePersonName(t.name);
    if ((tKey === key || tKey.includes(key) || key.includes(tKey)) && t.relation) {
      return t.relation;
    }
  }

  return yahoo.rosterByName[key];
}

function buildInsiderRows(
  finnhubData: {
    name: string;
    share: number;
    change: number;
    transactionDate: string;
    transactionCode: string;
    transactionPrice?: number;
    relationship?: string;
    position?: string;
  }[],
  yahooInsider: YahooInsiderData | null,
  executives: { name: string; position?: string }[],
  quotePrice: number
): InsiderRow[] {
  if (finnhubData.length > 0) {
    return finnhubData.slice(0, 12).map((t) => {
      const unitPrice =
        t.transactionPrice && t.transactionPrice > 0 ? t.transactionPrice : null;
      const amount = unitPrice != null ? t.change * unitPrice : null;
      return {
        name: t.name,
        date: t.transactionDate,
        change: t.change,
        shares: t.share,
        transactionCode: t.transactionCode,
        transactionPrice:
          t.transactionPrice && t.transactionPrice > 0 ? t.transactionPrice : null,
        amount,
        relationship:
          t.relationship?.trim() ||
          t.position?.trim() ||
          lookupYahooRelationship(t.name, t.transactionDate, yahooInsider) ||
          matchExecutivePosition(t.name, executives) ||
          null,
      };
    });
  }

  if (!yahooInsider?.transactions.length) return [];

  return yahooInsider.transactions.slice(0, 12).map((t) => {
    const change = yahooInsiderShareChange(t.shares, t.transactionText);
    const unitPrice =
      t.value && t.shares
        ? Math.abs(t.value / t.shares)
        : null;
    const amount =
      t.value ?? (unitPrice != null ? change * unitPrice : null);
    return {
      name: t.name,
      date: t.date,
      change,
      shares: 0,
      transactionCode: change < 0 ? "S" : "P",
      transactionPrice: unitPrice,
      amount,
      relationship:
        t.relation?.trim() ||
        yahooInsider.rosterByName[normalizePersonName(t.name)] ||
        null,
    };
  });
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
  },
  price: number
): AnalysisSection[] {
  const revenueTtm =
    m.revenuePerShareTTM && profile.shareOutstanding
      ? m.revenuePerShareTTM * profile.shareOutstanding * 1_000_000
      : null;

  const peTtm =
    finitePositive(m.peTTM) ??
    (price > 0 && finitePositive(m.epsTTM) ? price / m.epsTTM : undefined);
  const forwardPe = finitePositive(m.forwardPE);
  const growth = finitePositive(m.epsGrowthTTMYoy, m.epsGrowth3Y);
  const pegTtm = resolvePeg(m.pegTTM, peTtm, growth);
  const pegForward = resolvePeg(undefined, forwardPe, growth);
  const epsPayback = earningsPaybackYears(peTtm, growth);
  const fcfPayback = finitePositive(m.pfcfShareTTM);

  return [
    {
      id: "overview",
      title: "Tổng quan",
      metrics: [
        metric("Vốn hóa", capMillions(profile.marketCapitalization ?? m.marketCapitalization)),
        metric("Doanh thu TTM", revenueTtm != null ? capMillions(revenueTtm / 1_000_000) : "—"),
        metric("EPS TTM", num(m.epsTTM)),
        signedMetric("EPS tăng Y/Y", m.epsGrowthTTMYoy, pct),
        signedMetric("Doanh thu tăng Y/Y", m.revenueGrowthTTMYoy, pct),
        metric("Cổ tức/năm", num(m.dividendPerShareTTM, 4)),
        positiveIfAbove("Tỷ suất cổ tức", m.dividendYieldIndicatedAnnual, pct, 0),
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
        pegMetric("PEG TTM", pegTtm),
        pegMetric("PEG Forward", pegForward),
        yearsMetric("Hoàn vốn EPS", epsPayback, 12, 25),
        yearsMetric("Hoàn vốn FCF", fcfPayback, 15, 30),
        metric("P/S (EV/Revenue)", num(m.evRevenueTTM)),
        metric("P/B", num(m.pb)),
        metric("P/FCF TTM", num(m.pfcfShareTTM)),
        metric("EV/EBITDA TTM", num(m.evEbitdaTTM)),
        positiveIfAbove("Thanh toán hiện hành", m.currentRatioQuarterly, num, 1),
        debtMetric("Nợ/VCSH", m["totalDebt/totalEquityQuarterly"]),
        debtMetric("Nợ dài hạn/VCSH", m["longTermDebt/equityQuarterly"]),
      ],
    },
    {
      id: "profitability",
      title: "Lợi nhuận",
      metrics: [
        positiveIfAbove("Biên gộp TTM", m.grossMarginTTM, pct, 30),
        positiveIfAbove("Biên hoạt động TTM", m.operatingMarginTTM, pct, 10),
        positiveIfAbove("Biên ròng TTM", m.netProfitMarginTTM, pct, 5),
        positiveIfAbove("ROE TTM", m.roeTTM, pct, 10),
        positiveIfAbove("ROE 5Y", m.roe5Y, pct, 10),
        signedMetric("EPS Q/Q Y/Y", m.epsGrowthQuarterlyYoy, pct),
        signedMetric("Doanh thu Q/Q Y/Y", m.revenueGrowthQuarterlyYoy, pct),
        signedMetric("EPS tăng 3Y", m.epsGrowth3Y, pct),
        signedMetric("EPS tăng 5Y", m.epsGrowth5Y, pct),
        metric("Tỷ lệ trả cổ tức", pct((m.payoutRatioTTM ?? 0) * 100)),
      ],
    },
    {
      id: "price",
      title: "Giá & thanh khoản",
      metrics: [
        metric("Cao 52 tuần", num(m["52WeekHigh"])),
        metric("Thấp 52 tuần", num(m["52WeekLow"])),
        signedMetric("Lợi nhuận 52 tuần", m["52WeekPriceReturnDaily"], pct),
        signedMetric("Lợi nhuận 3 tháng", m["13WeekPriceReturnDaily"], pct),
        metric("KL TB 10 ngày", num(m["10DayAverageTradingVolume"], 0)),
        metric("KL TB 3 tháng", num(m["3MonthAverageTradingVolume"], 0)),
        volatilityMetric("Độ biến động 3 tháng", m["3MonthADReturnStd"]),
      ],
    },
  ];
}

export interface StockAnalysisExtra {
  peers: string[];
  insiderTransactions: InsiderRow[];
  news: NewsRow[];
  optionFlow: OptionFlowSummary | null;
  assessment: StockAssessment;
}

async function fetchEarningsUpcoming(
  upper: string
): Promise<StockAnalysis["earningsUpcoming"]> {
  const key = getFinnhubApiKey();
  if (!key) return [];

  const now = new Date();
  const calFrom = now.toISOString().slice(0, 10);
  const calTo = new Date(now.getTime() + 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);

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
      return data.earningsCalendar.sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  return [];
}

async function fetchCompanyNews(upper: string): Promise<NewsRow[]> {
  const key = getFinnhubApiKey();
  if (!key) return [];

  const now = new Date();
  const fromNews = new Date();
  fromNews.setDate(fromNews.getDate() - 30);

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
    return items.slice(0, 15).map((n) => ({
      headline: n.headline,
      date: new Date(n.datetime * 1000).toISOString(),
      source: n.source,
      url: n.url,
    }));
  }
  return [];
}

type FinnhubProfile = {
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
};

function buildCoreSections(
  quote: { price: number; changePercent: number },
  profile: FinnhubProfile | null,
  metricsRes: { metric?: Record<string, number> } | null
): AnalysisSection[] {
  const m = metricsRes?.metric ?? {};
  const sections: AnalysisSection[] = metricsRes
    ? buildSections(m, profile ?? {}, quote.price)
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

  return sections;
}

export async function fetchStockAnalysisExtra(
  symbol: string,
  core: Pick<
    StockAnalysis,
    "symbol" | "price" | "sections" | "priceHistory" | "priceLevels" | "recommendations"
  > & { metrics: Record<string, number> }
): Promise<StockAnalysisExtra> {
  const upper = symbol.trim().toUpperCase();

  const [insiderRes, executiveRes, yahooInsider, peers, optionFlow, news] =
    await Promise.all([
      finnhubGet<{
        data?: {
          name: string;
          share: number;
          change: number;
          transactionDate: string;
          transactionCode: string;
          transactionPrice?: number;
          relationship?: string;
          position?: string;
        }[];
      }>("stock/insider-transactions?", upper),
      finnhubGet<{
        executive?: { name: string; position?: string }[];
      }>("stock/executive?", upper),
      fetchYahooInsiderData(upper),
      finnhubGet<string[]>("stock/peers?", upper),
      fetchOptionFlow(upper),
      fetchCompanyNews(upper),
    ]);

  const insiderTransactions = buildInsiderRows(
    insiderRes?.data ?? [],
    yahooInsider,
    executiveRes?.executive ?? [],
    core.price
  );

  const assessment = computeStockAssessment({
    price: core.price,
    metrics: core.metrics,
    news,
    insiderTransactions,
    recommendations: core.recommendations,
    priceLevels: core.priceLevels,
    optionFlow,
  });

  return {
    peers: (peers ?? []).filter((p) => p !== upper).slice(0, 8),
    insiderTransactions,
    news,
    optionFlow,
    assessment,
  };
}

export async function fetchStockAnalysis(symbol: string): Promise<StockAnalysis | null> {
  const upper = symbol.trim().toUpperCase();
  if (!upper || upper === "CASH") return null;

  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);

  const [
    quote,
    priceHistory,
    profile,
    metricsRes,
    earningsHist,
    earningsUpcoming,
    recommendations,
  ] = await Promise.all([
    fetchQuoteForSymbol(upper),
    fetchPriceHistory(upper, from, new Date()),
    finnhubGet<FinnhubProfile>("stock/profile2?", upper),
    finnhubGet<{ metric?: Record<string, number> }>("stock/metric?metric=all&", upper),
    finnhubGet<
      { period: string; estimate?: number; actual?: number; surprisePercent?: number }[]
    >("stock/earnings?", upper),
    fetchEarningsUpcoming(upper),
    finnhubGet<RecommendationRow[]>("stock/recommendation?", upper),
  ]);

  if (!quote) return null;

  const sources: string[] = ["Yahoo Finance"];
  let note: string | undefined;

  if (profile) sources.push("Finnhub");
  else if (upper.includes(".")) {
    note =
      "Finnhub free chủ yếu hỗ trợ mã US — chỉ số cơ bản có thể thiếu với mã .PA.";
  }

  const m = metricsRes?.metric ?? {};
  const sections = buildCoreSections(quote, profile, metricsRes);

  const priceLevels = computePriceLevels(
    quote.price,
    m,
    priceHistory,
    recommendations ?? [],
    earningsUpcoming
  );

  const assessment = computeStockAssessment({
    price: quote.price,
    metrics: m,
    news: [],
    insiderTransactions: [],
    recommendations: recommendations ?? [],
    priceLevels,
    optionFlow: null,
  });

  return {
    symbol: upper,
    name: profile?.name ?? quote.shortName ?? upper,
    exchange: profile?.exchange ?? quote.exchangeName,
    country: profile?.country,
    currency: quote.currency ?? profile?.currency ?? "USD",
    logo: profile?.logo,
    website: profile?.weburl,
    ipo: profile?.ipo,
    peers: [],
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
    recommendations: (recommendations ?? []).slice(0, 6),
    insiderTransactions: [],
    news: [],
    priceHistory,
    priceLevels,
    assessment,
    metrics: m,
    sources,
    note,
  };
}
