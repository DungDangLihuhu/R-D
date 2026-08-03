"use client";

import { useEffect, useState } from "react";
import { tickerLabel } from "@/lib/symbol-profile";

export { tickerLabel };

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(symbol: string) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function SymbolAvatar({
  symbol,
  logo,
  size = "md",
}: {
  symbol: string;
  logo?: string;
  size?: "sm" | "md";
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(logo ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImgSrc(logo ?? null);
    setFailed(false);
  }, [logo, symbol]);

  useEffect(() => {
    if (symbol === "CASH" || imgSrc || failed) return;

    let cancelled = false;
    fetch(`/api/profile?symbol=${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((data: { logo?: string }) => {
        if (!cancelled && data.logo) setImgSrc(data.logo);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [symbol, imgSrc, failed]);

  const label = tickerLabel(symbol);
  const sizeClass =
    label.length > 4
      ? "text-[8px]"
      : label.length > 3
        ? "text-[10px]"
        : "text-xs";
  const boxClass = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  if (imgSrc && !failed) {
    return (
      <img
        src={imgSrc}
        alt=""
        className={`${boxClass} shrink-0 rounded-lg border border-gray-100 bg-white object-contain p-0.5`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg px-0.5 font-bold leading-none ${sizeClass} ${avatarColor(symbol)}`}
      title={symbol}
    >
      {label.slice(0, 4)}
    </div>
  );
}
