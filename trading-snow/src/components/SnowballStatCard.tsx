"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";

export function SnowballStatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClassName,
  badge,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconClassName: string;
  badge?: { text: string; positive: boolean };
  valueClassName?: string;
}) {
  return (
    <div className="app-card app-card-static min-w-0">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm text-gray-500">{label}</span>
      </div>

      <div className="mt-3 min-w-0 space-y-1.5">
        <p
          className={`min-w-0 text-[clamp(0.95rem,4.4vw,1.5rem)] font-semibold leading-tight tabular-nums text-gray-900 ${valueClassName ?? ""}`}
        >
          {value}
        </p>
        {badge && (
          <span
            className={`inline-flex w-fit max-w-full shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
              badge.positive
                ? "bg-emerald-50/90 text-emerald-700 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                : "bg-rose-50/90 text-rose-700 shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            }`}
          >
            {badge.positive ? (
              <ArrowUp className="h-3 w-3 shrink-0" />
            ) : (
              <ArrowDown className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{badge.text}</span>
          </span>
        )}
      </div>

      {sub && <p className="mt-2 text-sm text-gray-500">{sub}</p>}
    </div>
  );
}
