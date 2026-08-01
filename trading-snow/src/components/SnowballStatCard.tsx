"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, EyeOff, HelpCircle } from "lucide-react";

export function SnowballStatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClassName,
  badge,
  tooltip,
  hidden,
  onToggleHidden,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconClassName: string;
  badge?: { text: string; positive: boolean };
  tooltip?: string;
  hidden?: boolean;
  onToggleHidden?: () => void;
}) {
  const displayValue = hidden ? "••••••" : value;
  const displaySub = hidden && sub ? "••••••" : sub;

  return (
    <div className="rounded-xl border border-[#3a3f47] bg-[#2f3339] p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm text-gray-400">{label}</span>
        {tooltip && (
          <span title={tooltip} className="text-gray-500">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <p className="text-2xl font-semibold tabular-nums text-white">{displayValue}</p>
        {onToggleHidden && (
          <button
            type="button"
            onClick={onToggleHidden}
            className="text-gray-500 hover:text-gray-300"
            aria-label={hidden ? "Hiện giá trị" : "Ẩn giá trị"}
          >
            <EyeOff className="h-4 w-4" />
          </button>
        )}
        {badge && !hidden && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
              badge.positive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {badge.positive ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {badge.text}
          </span>
        )}
      </div>

      {displaySub && (
        <p className="mt-2 text-sm text-gray-400">{displaySub}</p>
      )}
    </div>
  );
}
