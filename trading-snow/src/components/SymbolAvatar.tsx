"use client";

import { useEffect, useState } from "react";
import { tickerLabel } from "@/lib/symbol-profile";
import { fetchProfileLogo } from "@/lib/profile-client-cache";

export { tickerLabel };

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
        // Nền trắng cả ở theme tối: logo nền trong suốt màu đen (Apple, X…) sẽ biến mất trên nền tối.
        style={{ borderColor: "var(--app-border-soft)", background: "#fff" }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      // Ô chữ trung tính, cùng khung với ô logo — màu bão hòa để dành cho lãi/lỗ.
      className={`flex ${boxClass} shrink-0 items-center justify-center rounded-lg border px-0.5 font-semibold leading-none text-app-secondary ${sizeClass}`}
      style={{ borderColor: "var(--app-border-soft)", background: "var(--tone-gray-50)" }}
      title={symbol}
    >
      {label.slice(0, 4)}
    </div>
  );
}
