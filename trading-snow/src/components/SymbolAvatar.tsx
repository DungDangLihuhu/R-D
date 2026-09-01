"use client";

import { useEffect, useState } from "react";
import { tickerLabel } from "@/lib/symbol-profile";
import { fetchProfileLogo } from "@/lib/profile-client-cache";

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
  const [fetched, setFetched] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [seenSymbol, setSeenSymbol] = useState(symbol);

  if (seenSymbol !== symbol) {
    setSeenSymbol(symbol);
    setFetched(null);
    setFailed(false);
  }

  useEffect(() => {
    if (symbol === "CASH" || logo) return;

    let cancelled = false;
    void fetchProfileLogo(symbol).then((found) => {
      if (!cancelled && found) setFetched(found);
    });

    return () => {
      cancelled = true;
    };
  }, [symbol, logo]);

  const src = failed ? null : (logo ?? fetched);
  const label = tickerLabel(symbol);
  const sizeClass =
    label.length > 4
      ? "text-[8px]"
      : label.length > 3
        ? "text-[10px]"
        : "text-xs";
  const boxClass = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const px = size === "sm" ? 32 : 36;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo đến từ CDN tùy provider, không cố định host cho next/image
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={`${boxClass} shrink-0 rounded-lg border object-contain p-0.5`}
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
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
