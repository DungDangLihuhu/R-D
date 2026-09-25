/**
 * Chấm tiêu đề tin tài chính (tiếng Anh) là tốt / xấu / trung tính cho một mã cụ thể,
 * bằng từ điển cụm từ tài chính — chạy ngay trong app, không cần key hay dịch vụ ngoài.
 *
 * Hai việc từ khóa chung làm sai: (1) Yahoo gắn mã vào cả tin thị trường và tin về công ty
 * khác, nên chỉ tính tiêu đề có nhắc tới công ty; (2) động từ giá ("slips", "soars") thuộc
 * về chủ ngữ — "Nvidia Slips as Macs…" là tin xấu của Nvidia, không phải của Apple.
 */

export type NewsTone = "positive" | "negative" | "neutral";

export interface CompanyRef {
  symbol: string;
  name?: string;
}

export interface HeadlineAssessment {
  /** Tiêu đề nói tới chính công ty (tên hoặc mã). */
  relevant: boolean;
  tone: NewsTone;
  /** −1…1 */
  score: number;
  /** Cụm từ đã khớp — để kiểm tra vì sao một tin bị chấm như vậy. */
  matches: string[];
}

interface Rule {
  pattern: RegExp;
  weight: number;
  /** Động từ biến động giá: chỉ tính khi công ty đứng trước (là chủ ngữ). */
  priceMove?: boolean;
}

const TERMS = {
  beat: "(?:beats?|beat|tops?|topped|exceeds?|exceeded|surpass(?:es|ed)?|crush(?:es|ed)?)",
  miss: "(?:miss(?:es|ed)?|falls? short of|fell short of|trails?|trailed|lags?|lagged)",
  expectation: "(?:estimates?|expectations?|forecasts?|consensus|views?|projections?)",
  raise: "(?:raises?|raised|lifts?|lifted|boosts?|boosted|hikes?|hiked|ups|increases?|increased)",
  cut: "(?:cuts?|lowers?|lowered|slash(?:es|ed)?|reduces?|reduced|trims?|trimmed|withdraws?|withdrew|suspends?|suspended)",
  outlook: "(?:guidance|outlook|forecasts?|full-year view|dividends?|(?:price )?targets?|payouts?)",
  results: "(?:results|earnings|quarter|demand|sales|revenue|growth|guidance|outlook|forecast|margins?|profits?)",
};

const RULES: Rule[] = [
  // Kết quả so với kỳ vọng — tín hiệu tin tức rõ nhất.
  { pattern: new RegExp(`\\b${TERMS.beat}\\b(?:(?!\\. )[^;:]){0,40}\\b${TERMS.expectation}\\b`), weight: 1 },
  { pattern: new RegExp(`\\b${TERMS.miss}\\b(?:(?!\\. )[^;:]){0,40}\\b${TERMS.expectation}\\b`), weight: -1 },
  { pattern: /\b(?:fails?|failed) to (?:beat|top|meet|impress)\b/, weight: -1 },
  // Hướng dẫn, cổ tức, giá mục tiêu.
  { pattern: new RegExp(`\\b${TERMS.raise}\\b(?:(?!\\. )[^;:]){0,30}\\b${TERMS.outlook}\\b`), weight: 0.9 },
  { pattern: new RegExp(`\\b${TERMS.cut}\\b(?:(?!\\. )[^;:]){0,30}\\b${TERMS.outlook}\\b`), weight: -0.9 },
  // Giá mục tiêu ở thể bị động: "price target raised by Jefferies to $410".
  { pattern: /\bprice targets? (?:is |was )?(?:raised|lifted|increased|hiked|boosted|upped)\b/, weight: 0.7 },
  { pattern: /\bprice targets? (?:is |was )?(?:cut|lowered|reduced|trimmed|slashed)\b/, weight: -0.7 },
  // Tiêu đề mẫu kiểu Zacks: so với thị trường.
  { pattern: /\b(?:bigger|larger|steeper|sharper) (?:fall|drop|decline|loss)\b|\blags? (?:the )?(?:broader )?market\b|\b(?:dips?|falls?|declines?) more than (?:the )?(?:broader )?market\b/, weight: -0.5 },
  { pattern: /\b(?:outpaces?|outperforms?|beats?|tops?) (?:the )?(?:broader )?(?:stock )?market\b|\brises? (?:higher|more) than (?:the )?(?:broader )?market\b/, weight: 0.5 },
  // Hành động của chuyên gia phân tích.
  { pattern: /\bupgrad(?:e|es|ed|ing)\b/, weight: 0.8 },
  { pattern: /\bdowngrad(?:e|es|ed|ing)\b/, weight: -0.8 },
  { pattern: /\b(?:outperform(?:s|ed|ers?)?|overweight|buy rating|top pick|strong buy|initiat\w* (?:at|with) buy)\b/, weight: 0.6 },
  { pattern: /\b(?:underperform(?:s|ed|ers?)?|underweight|sell rating|strong sell|initiat\w* (?:at|with) sell)\b/, weight: -0.6 },
  { pattern: /\b(?:don't|do not|avoid|never) buy\b|\b(?:time to|should) sell\b|\bsell now\b|\b(?:reasons?|stocks?) to avoid\b|\b(?:told|tells|urges?|advises?) (?:investors|clients) to sell\b/, weight: -0.6 },
  { pattern: /\b(?:buy now|time to buy|reasons? to buy|screaming buy|no-brainer buy)\b/, weight: 0.4 },
  { pattern: /\b(?:gets?|got|wins?|won|earns?)\s+(?:a\s+)?(?:[\w-]+\s+){0,3}boost\b/, weight: 0.6 },
  // Kỷ lục, kết quả mạnh / yếu.
  { pattern: /\b(?:record|all-time)[- ](?:high|highs|revenue|sales|profits?|earnings|quarter|results|deliveries)\b/, weight: 0.8 },
  { pattern: new RegExp(`\\b(?:strong|robust|solid|blowout|stellar|better-than-expected)\\b(?:(?!\\. )[^;:]){0,20}\\b${TERMS.results}\\b`), weight: 0.7 },
  { pattern: new RegExp(`\\b(?:weak|disappointing|dismal|soft|poor|bleak|worse-than-expected|sluggish)\\b(?:(?!\\. )[^;:]){0,20}\\b${TERMS.results}\\b`), weight: -0.7 },
  { pattern: /\b(?:profit|earnings|sales|revenue) (?:warning|slump|plunge|drop|decline|miss)\b/, weight: -0.9 },
  { pattern: /\b(?:profits?|earnings|sales|revenue|eps|margins?)\b(?:(?!\. )[^;:]){0,15}\b(?:expected|seen|forecast|projected|set) to (?:decline|fall|drop|shrink|slide)\b/, weight: -0.7 },
  { pattern: /\b(?:profits?|earnings|sales|revenue|eps|margins?)\b(?:(?!\. )[^;:]){0,15}\b(?:expected|seen|forecast|projected|set) to (?:rise|grow|jump|climb|surge|expand)\b/, weight: 0.7 },
  // Biến động giá — chỉ tính khi đúng công ty này tăng/giảm (xem `attributable`).
  { pattern: /\b(?:moves?|moved|trades?|traded|trading|heads?|headed|edges?|edged|inch(?:es|ed)|ticks?|ticked)\s+(?:lower|down)\b|\bdown\s+\d[\d.,]*%/, weight: -0.5, priceMove: true },
  { pattern: /\b(?:moves?|moved|trades?|traded|trading|heads?|headed|edges?|edged|inch(?:es|ed)|ticks?|ticked)\s+(?:higher|up)\b|\bup\s+\d[\d.,]*%/, weight: 0.5, priceMove: true },
  // "Why Oracle (ORCL) Stock Is Down Today" — mẫu tiêu đề rất phổ biến.
  { pattern: /\b(?:is|are)\s+(?:down|lower|falling|dropping|sliding|sinking|tumbling|plunging)\b/, weight: -0.5, priceMove: true },
  { pattern: /\b(?:is|are)\s+(?:up|higher|rising|climbing|jumping|soaring|surging|rallying)\b/, weight: 0.5, priceMove: true },
  // Biến động giá mạnh.
  { pattern: /\b(?:soar(?:s|ed|ing)?|surg(?:e|es|ed|ing)|skyrocket(?:s|ed|ing)?|rocket(?:s|ed)?)\b/, weight: 0.9, priceMove: true },
  { pattern: /\b(?:plung(?:e|es|ed|ing)|plummet(?:s|ed|ing)?|tumbl(?:e|es|ed|ing)|sank|tank(?:s|ed|ing)?|crash(?:es|ed|ing)?|nosedives?|craters?|collaps(?:e|es|ed))\b/, weight: -0.9, priceMove: true },
  // Biến động giá nhẹ.
  { pattern: /\b(?:jump(?:s|ed)?|rall(?:y|ies|ied)|climb(?:s|ed)?|gain(?:s|ed)?|rises?|rose|advanc(?:e|es|ed)|rebound(?:s|ed)?|spik(?:e|es|ed)|pops?|popped)\b/, weight: 0.5, priceMove: true },
  { pattern: /\b(?:fall(?:s|ing)?|fell|drop(?:s|ped|ping)?|slip(?:s|ped|ping)?|slid(?:e|es|ing)?|declin(?:e|es|ed|ing)|dip(?:s|ped)?|retreat(?:s|ed)?|sag(?:s|ged)?|slump(?:s|ed)?|skid(?:s|ded)?|sink(?:s|ing)?|sell-?off)\b/, weight: -0.5, priceMove: true },
  // Tin tốt khác. "Clears antitrust hurdle" đứng trước quy tắc pháp lý để không bị tính là tin xấu.
  { pattern: /\b(?:clears?|cleared|passes|passed|wins?|won)\b(?:(?!\. )[^;:]){0,25}\b(?:hurdle|approval|review)\b/, weight: 0.6 },
  { pattern: /\b(?:buyback|repurchase)\b/, weight: 0.5 },
  { pattern: /\b(?:bought back in|buys? back in|(?:takes?|took|builds?|built|ups?|upped|boosts?|boosted) (?:a |its |his |her |their )?(?:new )?stake)\b/, weight: 0.5 },
  { pattern: /\b(?:fda|regulators?|eu|ftc|court)\b(?:(?!\. )[^;:]){0,20}\b(?:approv\w*|clears?|cleared|nod)\b/, weight: 0.8 },
  { pattern: /\b(?:wins?|won|secur(?:es|ed)|lands?|landed|awarded|strikes?|struck|inks?|inked|signs?|signed|receiv(?:es|ed)|gets?|got)\b(?:(?!\. )[^;:]){0,30}\b(?:approval|contract|deal|order|case|lawsuit|ruling|pact|agreement|partnership)\b/, weight: 0.6 },
  { pattern: /\b(?:bullish|upbeat|optimistic|beats? the market|undervalued|catalysts?|defy(?:ing|ies)? expectations|winners?|positioned to win|likes|benefit(?:s|ing)? from|margin (?:growth|expansion))\b/, weight: 0.4 },
  { pattern: /\bpositive (?:phase \d\w*|pivotal|late-stage|trial|topline|clinical|study) ?(?:data|results|readout|trial)?\b/, weight: 0.6 },
  { pattern: /\b(?:surging|soaring|booming|rising|record|strong) (?:[\w-]+ ){0,2}demand\b/, weight: 0.5 },
  { pattern: /\b(?:overvalued|expensive|overdone|bubble)\b/, weight: -0.4 },
  { pattern: /\b(?:record|all-time|multi-year|\d+-year) lows?\b|\b(?:lose|loses|losing|lost) (?:ground|share|market share)\b/, weight: -0.6 },
  { pattern: /\b(?:hurts?|hurting|hit by|weighs? on|weighed on)\b|\bfaces? (?:[\w-]+ ){0,2}(?:challenges|headwinds|pressure|hurdles|risks?|scrutiny|backlash)\b/, weight: -0.4 },
  // Tin xấu khác.
  { pattern: /\b(?:fraud|bankruptcy|chapter 11|defaults?|defaulted|going concern|restatement|accounting (?:probe|issues?|irregularities))\b/, weight: -1 },
  { pattern: /\b(?:lawsuits?|sues|sued|probes?|investigations?|subpoena\w*|antitrust|fined|fines?|penalt(?:y|ies)|settlements?|settles)\b/, weight: -0.5 },
  { pattern: /\b(?:recalls?|recalled|layoffs?|job cuts|cuts? (?:\d[\d,]* )?jobs|strikes?|outages?|breach(?:es)?|hacked|halts?|halted|delays?|delayed|bans?|banned|tariffs?|short sellers?|short report|force majeure|flaws?|vulnerabilit(?:y|ies)|data theft)\b/, weight: -0.5 },
  { pattern: /\b(?:clos(?:e|es|ing)|shut(?:s|ting)?(?: down)?)\b(?:(?!\. )[^;:]){0,20}\b(?:stores?|cafes?|locations?|plants?|factories|offices|branches|restaurants)\b|\bstore closings?\b/, weight: -0.5 },
  { pattern: /\b(?:concerns?|worr(?:y|ies|ied)|fears?|warns?|warning|headwinds?|scrutiny|backlash|cautious|downside|problems?|troubles?|squeez\w*|pressure|shocks?)\b/, weight: -0.4 },
  { pattern: /\b(?:stark|blunt|harsh|dire|grim) (?:message|warning|outlook|reality)\b/, weight: -0.4 },
  { pattern: /\b(?:bearish|gloomy|pessimistic)\b/, weight: -0.4 },
  { pattern: /\b(?:ceo|cfo|chief executive)\b(?:(?!\. )[^;:]){0,25}\b(?:resigns?|steps? down|ousted|departs?|exits?)\b/, weight: -0.4 },
];

const ABBREVIATIONS = /\b(?:u\.s|u\.k|e\.u|j\.p|inc|corp|co|ltd|vs|st|no|mr|ms|dr|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\./g;

/** "Adjusts Price Target on Deere to $715 From $667": chiều thay đổi nằm ở hai con số. */
const TARGET_MOVE = /\bprice target\b(?:(?!\. )[^;:]){0,50}?\bto \$?([\d,.]+)\s+from \$?([\d,.]+)/;

/**
 * Ngân hàng/công ty chứng khoán hay xuất hiện với vai trò người đưa khuyến nghị ("BofA cuts
 * price target", "Nebius gets BofA boost") — những lần nhắc đó không phải tin về chính họ.
 */
const ANALYST_FIRMS = new Set(["JPM", "BAC", "GS", "MS", "C", "WFC", "UBS", "DB", "HSBC", "BCS", "JEF", "RJF", "EVR", "SF", "PIPR", "MUFG"]);
const SOURCE_AFTER = /^(?:'s)?\s+(?:(?:securities|research|global research|analysts?|strategists?|economists?|just|also)\s+)*(?:cuts?|raises?|lifts?|lowers?|boosts?|trims?|hikes?|slash(?:es)?|upgrades?|downgrades?|initiates?|reiterates?|resets?|adjusts?|sets?|sees?|says|said|told|tells|sends?|warns?|expects?|predicts?|flags?|likes?|names?|picks?|remains|recommends?|is (?:bullish|bearish)|turns|doubles down)\b/;
const SOURCE_BEFORE = /\b(?:gets?|got|per|according to|from|by|as)\s+(?:a\s+)?$/;

/** Từ phủ định ngay trước cụm từ đảo chiều ý nghĩa: "not a downgrade", "no recall". */
const NEGATION = /\b(?:not|no|never|without|avoids?|avoided|denies|denied)\s+(?:\w+\s+){0,2}$/;

const CORPORATE_WORDS = new Set([
  "inc", "incorporated", "corp", "corporation", "company", "co", "ltd", "limited", "plc",
  "holding", "holdings", "group", "the", "nv", "sa", "se", "ag", "class", "a", "b", "c",
  "platforms", "com", "public",
]);

/** Từ nối không đứng đầu/cuối tên: "Merck & Co." → "merck", "Eli Lilly and Company" → "eli lilly". */
const CONNECTORS = new Set(["&", "and", "of"]);

/** Từ quá chung để một mình đại diện cho công ty ("Bank of America" không khớp mọi "bank"). */
const GENERIC_WORDS = new Set([
  "bank", "america", "american", "international", "financial", "energy", "motors", "motor",
  "systems", "communications", "services", "industries", "global", "capital", "resources",
  "brands", "health", "healthcare", "airlines", "pharmaceuticals", "technologies",
  "technology", "united", "general", "national", "first", "trust", "partners", "solutions",
  "networks", "software", "semiconductor", "entertainment", "foods", "products",
  "therapeutics", "sciences", "labs", "laboratories", "royal", "new", "digital", "data",
  "electric", "power", "oil", "gas", "mobile", "media", "chase", "walt", "aerospace",
  "service", "scientific", "martin",
]);

/** Tên thường gặp trên báo khác tên pháp lý. */
const ALIASES: Record<string, string[]> = {
  GOOGL: ["google"],
  GOOG: ["google"],
  META: ["facebook"],
  "BRK-B": ["berkshire"],
  "BRK.B": ["berkshire"],
  JNJ: ["j&j"],
  KO: ["coke"],
  PEP: ["pepsi"],
  BAC: ["bofa"],
  JPM: ["j.p. morgan", "jp morgan"],
  AAPL: ["iphone"],
};

/** Tên công ty trùng thuật ngữ tài chính: "price target" không phải Target Corporation. */
const AMBIGUOUS_NAMES: Record<string, { before: RegExp; after: RegExp }> = {
  target: {
    before: /\b(?:price|profit|sales|revenue|growth|inflation|earnings|analyst|new|raises?|cuts?|hits?|misses?)\s+$/,
    after: /^\s+(?:price|prices|of|for)\b/,
  },
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Các cách tiêu đề gọi tên công ty (chữ thường): tên đã bỏ hậu tố pháp lý, từ riêng của tên, alias. */
export function companyKeys(company: CompanyRef): string[] {
  const keys = new Set<string>(ALIASES[company.symbol.toUpperCase()] ?? []);
  const words = (company.name ?? "")
    .toLowerCase()
    .replace(/\(the\)/g, " ")
    .replace(/\.com\b/g, " ")
    .replace(/[,()]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w && !CORPORATE_WORDS.has(w.replace(/\./g, "")));
  while (words.length && CONNECTORS.has(words[0])) words.shift();
  while (words.length && CONNECTORS.has(words[words.length - 1])) words.pop();
  if (words.length) {
    keys.add(words.join(" "));
    for (const word of words) {
      if (word.length >= 4 && !GENERIC_WORDS.has(word) && !/^\d+$/.test(word)) keys.add(word);
    }
  }
  return [...keys];
}

/**
 * Mã trên tiêu đề viết hoa ("AAPL", "$NVDA") — so khớp phân biệt hoa thường để "CAT",
 * "NOW", "ALL" không khớp chữ thường. Mã sàn ngoài Mỹ ("SAN.PA") ít khi xuất hiện, bỏ qua.
 */
function tickerPattern(symbol: string): RegExp | null {
  const upper = symbol.toUpperCase();
  if (upper.includes(".")) return null;
  const base = escapeRegExp(upper.replace(/-/g, "."));
  if (upper.length >= 3) return new RegExp(`(?<![A-Za-z0-9])\\$?${base}(?![A-Za-z0-9])`);
  // "GE HealthCare" không phải GE: mã 1–2 chữ chỉ tính khi rõ là mã — "(GE)", "$GE", "HD Stock".
  return new RegExp(`\\$${base}(?![A-Za-z0-9])|\\(${base}\\)|(?<![A-Za-z0-9])${base}(?= (?:[Ss]tock|[Ss]hares)\\b)`);
}

interface Span {
  start: number;
  end: number;
}

/** Mọi chỗ tiêu đề nhắc tới công ty, theo thứ tự xuất hiện. */
function mentionSpans(display: string, company: CompanyRef): Span[] {
  const lower = display.toLowerCase();
  const spans: Span[] = [];
  for (const key of companyKeys(company)) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`, "g");
    for (const m of lower.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const ambiguous = AMBIGUOUS_NAMES[key];
      if (ambiguous && (ambiguous.before.test(lower.slice(0, start)) || ambiguous.after.test(lower.slice(end)))) continue;
      spans.push({ start, end });
    }
  }
  const ticker = tickerPattern(company.symbol);
  if (ticker) {
    for (const m of display.matchAll(new RegExp(ticker.source, "g"))) {
      spans.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Chữ được phép đứng giữa tên công ty và động từ giá: "Intel Shares Rise", "Micron Just Rallied". */
const FILLER = /^(?:'s|stock|stocks|shares?|just|has|have|had|is|are|was|were|now|again|also|inc\.?|corp\.?|\([a-z.$:]{1,12}\)|[()]+)$/;

/**
 * Động từ giá thuộc về chủ ngữ của nó: công ty đứng ngay trước ("Apple Slips", "Oracle Stock
 * Slides"), hoặc tiêu đề mở đầu bằng công ty và động từ gắn với "stock"/"shares"
 * ("Boeing Unlikely…; Stock Falls", "…Why It's Sinking the Stock").
 */
function attributable(text: string, spans: Span[], start: number, end: number): boolean {
  const before = spans.filter((m) => m.end <= start);
  const nearest = before[before.length - 1];
  if (nearest) {
    const gap = text.slice(nearest.end, start).trim().split(/\s+/).filter(Boolean);
    if (gap.length <= 3 && gap.every((t) => FILLER.test(t))) return true;
  }
  const leads = spans.length > 0 && spans[0].start <= 4;
  if (!leads) return false;
  return (
    /\b(?:stock|shares?)\s+(?:is\s+|are\s+|was\s+)?$/.test(text.slice(0, start)) ||
    /^\s+(?:the\s+)?(?:stock|shares)\b/.test(text.slice(end))
  );
}

/** Chuẩn hóa khoảng trắng và dấu nháy, giữ hoa thường (vị trí ký tự không đổi khi hạ chữ). */
function tidyHeadline(headline: string): string {
  return headline
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeadline(headline: string): string {
  return tidyHeadline(headline).toLowerCase();
}

export function assessHeadline(headline: string, company: CompanyRef): HeadlineAssessment {
  const display = tidyHeadline(headline);
  const text = display.toLowerCase();
  const firm = ANALYST_FIRMS.has(company.symbol.toUpperCase());
  const spans = mentionSpans(display, company).filter(
    (m) => !firm || !(SOURCE_AFTER.test(text.slice(m.end)) || SOURCE_BEFORE.test(text.slice(0, m.start)))
  );
  const relevant = spans.length > 0;
  // Quy tắc không vượt qua ". " (hết câu); che dấu chấm của chữ viết tắt ("U.S.", "Inc.")
  // mà giữ nguyên độ dài để vị trí vẫn khớp với chỗ nhắc tên công ty.
  const ruleText = text.replace(ABBREVIATIONS, (m) => m.replace(/\./g, "_"));

  let score = 0;
  const matches: string[] = [];
  const claimed: [number, number][] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, "g");
    for (const m of ruleText.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      // Một đoạn chỉ tính một lần (quy tắc trước — cụ thể hơn — thắng).
      if (claimed.some(([a, b]) => start < b && end > a)) continue;
      if (rule.priceMove && !attributable(text, spans, start, end)) continue;
      let weight = rule.weight;
      if (NEGATION.test(text.slice(0, start))) weight = -weight * 0.5;
      claimed.push([start, end]);
      matches.push(m[0]);
      score += weight;
    }
  }
  const target = TARGET_MOVE.exec(ruleText);
  if (target && !claimed.some(([a, b]) => (target.index ?? 0) < b && (target.index ?? 0) + target[0].length > a)) {
    const to = Number(target[1].replace(/,/g, ""));
    const from = Number(target[2].replace(/,/g, ""));
    if (to > 0 && from > 0 && to !== from) {
      score += to > from ? 0.7 : -0.7;
      matches.push(target[0]);
    }
  }
  // Tiêu đề mở đầu bằng câu hỏi ("Is X a buy?") là bài nhận định, không phải sự kiện;
  // "Micron Just Rallied 17%: Take Profits?" vẫn là tin tăng giá.
  if (/^(?:is|are|was|can|could|should|will|would|what|why|how|does|do|did|has|have|which|who)\b/.test(text) && text.endsWith("?")) {
    score *= 0.5;
  }
  score = Math.max(-1, Math.min(1, score));
  const tone: NewsTone = score >= 0.3 ? "positive" : score <= -0.3 ? "negative" : "neutral";
  return { relevant, tone, score, matches };
}

export interface NewsDigest {
  /** Số tin trong khoảng xét sau khi gộp trùng. */
  total: number;
  relevant: number;
  positive: number;
  negative: number;
  /** −1…1, đã co về 0 khi có ít tin; null khi không tin nào nói về công ty. */
  score: number | null;
}

const DAY_MS = 86_400_000;

/**
 * Gộp tin trong `days` ngày: chỉ tin nói về công ty, tin mới nặng hơn (bán rã 2 ngày), bài
 * trùng tiêu đề tính một lần, và co về 0 bằng 1,5 "tin trung tính" ảo để một tin lẻ không
 * kéo điểm ra cực.
 */
export function digestNews(
  news: { headline: string; date: string }[],
  company: CompanyRef,
  now = Date.now(),
  days = 7
): NewsDigest {
  const seen = new Set<string>();
  let total = 0;
  let relevant = 0;
  let positive = 0;
  let negative = 0;
  let weighted = 0;
  let weights = 0;
  for (const n of news) {
    const age = (now - Date.parse(n.date)) / DAY_MS;
    if (!Number.isFinite(age) || age > days) continue;
    const key = normalizeHeadline(n.headline).replace(/[^a-z0-9 ]/g, "").slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;
    const a = assessHeadline(n.headline, company);
    if (!a.relevant) continue;
    relevant += 1;
    if (a.tone === "positive") positive += 1;
    else if (a.tone === "negative") negative += 1;
    const w = 0.5 ** (Math.max(age, 0) / 2);
    weighted += w * a.score;
    weights += w;
  }
  return {
    total,
    relevant,
    positive,
    negative,
    score: relevant ? weighted / (weights + 1.5) : null,
  };
}
