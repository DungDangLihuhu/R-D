import { formatPercent } from "@/lib/format";
import type { MarketSession } from "@/lib/types";

function pnlClass(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-gray-600";
}

export function SessionBadge({
  session,
  changePercent,
}: {
  session?: MarketSession;
  changePercent?: number | null;
}) {
  if (session !== "pre" && session !== "post") return null;
  const label = session === "pre" ? "Pre-market" : "After hours";
  if (changePercent == null || !Number.isFinite(changePercent)) {
    return (
      <span className="mt-0.5 block text-[10px] font-medium text-violet-600">
        ({label})
      </span>
    );
  }
  return (
    <span
      className={`mt-0.5 block text-[10px] font-semibold tabular-nums whitespace-nowrap ${pnlClass(changePercent)}`}
    >
      ({label} {formatPercent(changePercent)})
    </span>
  );
}
