import { describe, expect, it } from "vitest";
import { assessHeadline, companyKeys, digestNews, type NewsTone } from "./news-sentiment";

const COMPANIES: Record<string, string> = {
  AAPL: "Apple Inc.",
  NVDA: "NVIDIA Corporation",
  BA: "The Boeing Company",
  DIS: "The Walt Disney Company",
  ORCL: "Oracle Corporation",
  NKE: "NIKE, Inc.",
  BAC: "Bank of America Corporation",
  GE: "GE Aerospace",
  DE: "Deere & Company",
  PYPL: "PayPal Holdings, Inc.",
  SBUX: "Starbucks Corporation",
  AMGN: "Amgen Inc.",
  INTU: "Intuit Inc.",
  LLY: "Eli Lilly and Company",
  TGT: "Target Corporation",
  MCD: "McDonald's Corporation",
  UPS: "United Parcel Service, Inc.",
};

function check(symbol: string, headline: string) {
  return assessHeadline(headline, { symbol, name: COMPANIES[symbol] });
}

// Tiêu đề thật trên Yahoo (tháng 9/2026) cùng nhãn gán tay.
const CASES: [string, string, boolean, NewsTone][] = [
  ["BA", "Boeing Unlikely To Get More China Orders During Trump-XI Summit; Stock Falls", true, "negative"],
  ["BA", "Boeing Lands Massive 150-Plane Deal With Turkish Airlines", true, "positive"],
  ["ORCL", "Oracle Stock Slides As 'Force Majeure' Report Brings Concern About Key AI Data Center", true, "negative"],
  ["ORCL", "Oracle Seeks ‘Force Majeure’ on Data Center. Why It’s Sinking the Stock.", true, "negative"],
  ["NKE", "Needham remains cautious on Nike stock, sees more downside risk", true, "negative"],
  ["NKE", "Earnings Preview: Nike (NKE) Q1 Earnings Expected to Decline", true, "negative"],
  ["NKE", "Don’t Buy Nike Stock Yet", true, "negative"],
  ["LLY", "Eli Lilly's Onswik Insulin Injection Gets FDA Approval for Adults with Type 2 Diabetes", true, "positive"],
  ["LLY", "Lilly Jumps 3.64% While a $100 Billion Obesity Race Crowds In", true, "positive"],
  ["MCD", "Baird Cuts McDonald's Price Target to $250 From $285, Neutral Rating Kept", true, "negative"],
  ["MCD", "McDonald's Store Expansion Targets Miss Consensus Views as Focus Remains on US Growth, RBC Says", true, "negative"],
  ["DE", "BofA Securities Adjusts Price Target on Deere & Company to $715 From $667", true, "positive"],
  ["PYPL", "PayPal Strikes Major Meta AI Shopping Deal", true, "positive"],
  ["SBUX", "Starbucks to close 250 more cafes in North America", true, "negative"],
  ["AMGN", "Amgen (AMGN) Is Up 7.9% After Positive Phase 3 Dazodalibep Data in Systemic Sjögren’s Disease", true, "positive"],
  ["AMGN", "Amgen price target raised by Jefferies to $410 after positive Sjögren's data", true, "positive"],
  ["INTU", "Intuit (INTU) Down 17.1% Since Last Earnings Report: Can It Rebound?", true, "negative"],
  ["UPS", "Bank of America Just Told Investors to Sell UPS, and the Reason Has Nothing to Do With Package Volume", true, "negative"],
  // Tin nói về công ty nhưng không nghiêng về phía nào.
  ["DIS", "Disney World's peak Magic Kingdom ticket jumps $10 to $219 for 2027", true, "neutral"],
  ["AAPL", "Qualcomm Renews Deal With Apple. Why the Stock Is Dropping Anyway.", true, "neutral"],
  ["AAPL", "Prediction: This Is What a $1,000 Investment in Apple Will Be Worth by 2030", true, "neutral"],
  // Không phải tin về công ty: động từ giá thuộc về công ty khác, hoặc tên chỉ là nguồn khuyến nghị.
  ["AAPL", "Nvidia Slips as Four Macs Attack Cloud Inference Economics", false, "neutral"],
  ["NVDA", "Nvidia Slips as Four Macs Attack Cloud Inference Economics", true, "negative"],
  ["BAC", "Carnival hit by rising oil costs as BofA cuts price target", false, "neutral"],
  ["BAC", "Nebius gets BofA boost as AI infrastructure revenue outlook climbs", false, "neutral"],
  ["GE", "GE HealthCare (GEHC) is Down 28% and Wall Street is Starting to Buy. Is the Selloff Finally Over?", false, "neutral"],
  ["TGT", "CareDx +14% on Fresh $74 Analyst Price Target", false, "neutral"],
];

describe("assessHeadline", () => {
  it.each(CASES)("%s: %s", (symbol, headline, relevant, tone) => {
    const a = check(symbol, headline);
    expect(a.relevant).toBe(relevant);
    if (relevant) expect(a.tone).toBe(tone);
  });

  it("reads a negation as the opposite, softened", () => {
    expect(check("AAPL", "Apple avoids downgrade as iPhone demand holds").tone).toBe("positive");
  });

  it("does not stop a phrase at the dot of U.S.", () => {
    expect(check("BA", "Boeing clears U.S. antitrust hurdle on defense unit sale").tone).toBe("positive");
  });

  it("damps opinion headlines phrased as a question", () => {
    const a = check("AAPL", "Is Apple Stock a Buy After Its Record Revenue Quarter?");
    expect(a.score).toBeCloseTo(0.4, 5);
  });
});

describe("companyKeys", () => {
  it("strips legal suffixes and skips generic words", () => {
    expect(companyKeys({ symbol: "DIS", name: "The Walt Disney Company" })).toEqual(["walt disney", "disney"]);
    expect(companyKeys({ symbol: "BAC", name: "Bank of America Corporation" })).toEqual(["bofa", "bank of america"]);
    expect(companyKeys({ symbol: "LLY", name: "Eli Lilly and Company" })).toContain("lilly");
  });
});

describe("digestNews", () => {
  const now = Date.parse("2026-09-24T12:00:00Z");
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
  const company = { symbol: "ORCL", name: "Oracle Corporation" };

  it("counts only news about the company, once per story", () => {
    const digest = digestNews(
      [
        { headline: "Oracle Stock Slides As 'Force Majeure' Report Brings Concern", date: at(2) },
        { headline: "Oracle Stock Slides As 'Force Majeure' Report Brings Concern", date: at(3) },
        { headline: "Sector Update: Tech Stocks Softer in Afternoon Trading", date: at(1) },
        { headline: "Oracle Beats Estimates and Raises Guidance", date: at(24 * 10) },
      ],
      company,
      now
    );
    expect(digest).toMatchObject({ total: 2, relevant: 1, positive: 0, negative: 1 });
    expect(digest.score).toBeLessThan(0);
  });

  it("pulls a single story toward neutral and weighs fresh news more", () => {
    const one = digestNews([{ headline: "Oracle Beats Estimates", date: at(1) }], company, now);
    expect(one.score).toBeGreaterThan(0);
    expect(one.score).toBeLessThan(0.5);
    const mixed = digestNews(
      [
        { headline: "Oracle Beats Estimates", date: at(1) },
        { headline: "Oracle Misses Estimates", date: at(24 * 5) },
      ],
      company,
      now
    );
    expect(mixed.score).toBeGreaterThan(0);
  });

  it("has no score when nothing is about the company", () => {
    const digest = digestNews([{ headline: "Stocks slide as yields climb", date: at(1) }], company, now);
    expect(digest).toMatchObject({ total: 1, relevant: 0, score: null });
  });
});
