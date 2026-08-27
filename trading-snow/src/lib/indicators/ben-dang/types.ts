export interface Bar {
  date: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  index: number;
}

export interface SwingPoint {
  index: number;
  price: number;
}

export interface PremiumDiscountZone {
  top: number;
  bottom: number;
  equilibrium: number;
  swingHighIndex: number;
  swingLowIndex: number;
}

export interface SmcResult {
  premiumDiscount?: PremiumDiscountZone;
}

export interface SrLevel {
  price: number;
  type: "support" | "resistance";
  strength: number;
  touches: number;
}

export interface SrResult {
  levels: SrLevel[];
}

export type WyckoffPhase =
  | "accumulation"
  | "markup"
  | "distribution"
  | "markdown"
  | "unknown";

export type WyckoffTimeframe = "1h" | "4h" | "1d" | "1w" | "all";
export type WyckoffConfidenceLevel = "low" | "medium" | "high";

export type WyckoffEvent =
  | "PS"
  | "SC"
  | "AR"
  | "ST"
  | "Spring"
  | "SOS"
  | "LPS"
  | "PSY"
  | "BC"
  | "UT"
  | "UTAD"
  | "SOW"
  | "LPSY";

export interface WyckoffEventMarker {
  index: number;
  event: WyckoffEvent;
  price: number;
  label: string;
}

export type WyckoffEntryAction = "buy" | "wait" | "avoid";

export interface WyckoffEntry {
  /** Mốc giá nên vào (long) theo pha Wyckoff */
  price: number;
  stop: number | null;
  action: WyckoffEntryAction;
  /** LPS, Spring/Ice, Creek… */
  label: string;
  reason: string;
}

export interface WyckoffResult {
  phase: WyckoffPhase;
  phaseLabel: string;
  tradingRange?: {
    top: number;
    bottom: number;
    /** Creek = kháng cự range tích lũy */
    creek: number;
    /** Ice = hỗ trợ range */
    ice: number;
    kind: "accumulation" | "distribution" | "range";
    topTouches: number;
    bottomTouches: number;
    startIndex: number;
    endIndex: number;
  };
  events: WyckoffEventMarker[];
  entry?: WyckoffEntry;
  confidence: {
    score: number;
    level: WyckoffConfidenceLevel;
    label: string;
  };
  warnings: string[];
  summary: {
    trend: string;
    volumePattern: string;
    recommendation: string;
  };
}

export interface BenDangIndicators {
  smc: SmcResult;
  sr: SrResult;
  wyckoff: WyckoffResult;
}

export interface BenDangOptions {
  smcSwingLength?: number;
  srPeriod?: number;
  srMaxLevels?: number;
  timeframe?: WyckoffTimeframe;
}

export interface BenDangLayers {
  smc: boolean;
  sr: boolean;
  wyckoff: boolean;
}
