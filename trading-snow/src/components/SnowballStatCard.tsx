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
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
          className={`min-w-0 text-xl font-semibold leading-tight tabular-nums text-gray-900 sm:text-2xl ${valueClassName ?? ""}`}
        >
          {value}
        </p>
        {badge && (
          <span
            className={`inline-flex w-fit max-w-full shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
              badge.positive
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
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
