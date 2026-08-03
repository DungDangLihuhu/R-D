"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { notifyPriceMoves, notifyUpcomingEvents } from "@/lib/proactive-toasts";

/**
 * Snowball-style in-app alerts while tab is open:
 * earnings/dividends/macro for holdings, large daily price moves.
 */
export function NotificationWatcher() {
  const { stats, state } = useApp();
  const symbols = stats.holdings.map((h) => h.symbol);
  const symbolKey = symbols.join(",");
  const lastPriceCheck = useRef<string | null>(null);

  useEffect(() => {
    if (symbols.length === 0) return;

    void notifyUpcomingEvents(symbols);

    const id = setInterval(() => {
      void notifyUpcomingEvents(symbols);
    }, 30 * 60 * 1000);

    return () => clearInterval(id);
  }, [symbolKey, symbols]);

  useEffect(() => {
    if (!state.pricesUpdatedAt || symbols.length === 0) return;
    if (lastPriceCheck.current === state.pricesUpdatedAt) return;
    lastPriceCheck.current = state.pricesUpdatedAt;

    notifyPriceMoves(state.marketQuotes ?? {}, symbols);
  }, [state.pricesUpdatedAt, state.marketQuotes, symbolKey, symbols]);

  return null;
}
