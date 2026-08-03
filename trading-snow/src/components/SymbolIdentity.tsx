"use client";

import type { ReactNode } from "react";
import { SymbolAvatar } from "@/components/SymbolAvatar";
import { tickerLabel } from "@/lib/symbol-profile";

export function SymbolIdentity({
  symbol,
  name,
  logo,
  size = "md",
  className = "",
  nameClassName = "truncate text-sm font-semibold leading-tight text-sky-800",
  tickerClassName = "text-[11px] font-medium leading-tight text-gray-500",
  extra,
}: {
  symbol: string;
  name?: string;
  logo?: string;
  size?: "sm" | "md";
  className?: string;
  nameClassName?: string;
  tickerClassName?: string;
  extra?: ReactNode;
}) {
  const isCash = symbol === "CASH";
  const displayName = isCash ? "Tiền mặt" : (name ?? symbol);
  const showTicker = !isCash && displayName !== symbol;

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      {!isCash && <SymbolAvatar symbol={symbol} logo={logo} size={size} />}
      <div className="min-w-0">
        <p className={nameClassName}>{displayName}</p>
        {showTicker && (
          <p className={`${tickerClassName} tabular-nums`}>{tickerLabel(symbol)}</p>
        )}
        {extra}
      </div>
    </div>
  );
}
