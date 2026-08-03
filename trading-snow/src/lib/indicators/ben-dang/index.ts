import type { BenDangIndicators, BenDangOptions } from "./types";
import { computeSmc } from "./smc";
import { computeSupportResistance } from "./support-resistance";
import { toBars } from "./utils";
import { computeWyckoff } from "./wyckoff";

export type {
  Bar,
  BenDangIndicators,
  BenDangLayers,
  BenDangOptions,
  FairValueGap,
  OrderBlock,
  SmcResult,
  SmcStructureLine,
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
  const swingLength = options.smcSwingLength ?? 5;
  const srPeriod = options.srPeriod ?? 10;
  const srMaxLevels = options.srMaxLevels ?? 5;

  return {
    smc: computeSmc(bars, swingLength),
    sr: computeSupportResistance(bars, srPeriod, srMaxLevels),
    wyckoff: computeWyckoff(bars),
  };
}
