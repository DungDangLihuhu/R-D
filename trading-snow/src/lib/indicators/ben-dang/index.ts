import type { BenDangIndicators, BenDangOptions } from "./types";
import { computeSmc } from "./smc";
import { computeSupportResistance } from "./support-resistance";
import { adaptivePivotPeriod, adaptiveSwingLength, toBars } from "./utils";
import { computeWyckoff } from "./wyckoff";

export type {
  Bar,
  BenDangIndicators,
  BenDangLayers,
  BenDangOptions,
  PremiumDiscountZone,
  SmcResult,
  SrLevel,
  SrResult,
  WyckoffEvent,
  WyckoffEventMarker,
  WyckoffPhase,
  WyckoffResult,
} from "./types";

export function computeBenDangIndicators(
  points: {
    date: string;
    label: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }[],
  options: BenDangOptions = {}
): BenDangIndicators {
  const bars = toBars(points);
  const swingLength =
    options.smcSwingLength ?? adaptiveSwingLength(bars.length);
  const srPeriod = options.srPeriod ?? adaptivePivotPeriod(bars.length);
  const srMaxLevels = options.srMaxLevels ?? 5;

  return {
    smc: computeSmc(bars, swingLength),
    sr: computeSupportResistance(bars, srPeriod, srMaxLevels),
    wyckoff: computeWyckoff(bars),
  };
}
