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

export type WyckoffEvent =
  | "PS"
  | "SC"
  | "AR"
  | "ST"
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

export interface WyckoffResult {
  phase: WyckoffPhase;
  phaseLabel: string;
  tradingRange?: {
    top: number;
    bottom: number;
    startIndex: number;
    endIndex: number;
  };
  events: WyckoffEventMarker[];
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
}

export interface BenDangLayers {
  smc: boolean;
  sr: boolean;
  wyckoff: boolean;
}
