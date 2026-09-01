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
  // Chuỗi đã sắp xếp thay vì mảng: mảng đổi identity mỗi render sẽ dựng lại
  // interval liên tục, còn thứ tự đổi thì làm hỏng cache theo URL của /api/events.
  const symbolKey = [...stats.holdings.map((h) => h.symbol)].sort().join(",");
  const lastPriceCheck = useRef<string | null>(null);

  useEffect(() => {
    if (!symbolKey) return;
    const symbols = symbolKey.split(",");

    void notifyUpcomingEvents(symbols);

    const id = setInterval(
      () => {
        void notifyUpcomingEvents(symbols);
      },
      30 * 60 * 1000
    );

    return () => clearInterval(id);
  }, [symbolKey]);

  useEffect(() => {
    if (!state.pricesUpdatedAt || !symbolKey) return;
    if (lastPriceCheck.current === state.pricesUpdatedAt) return;
    lastPriceCheck.current = state.pricesUpdatedAt;

    notifyPriceMoves(state.marketQuotes ?? {}, symbolKey.split(","));
  }, [state.pricesUpdatedAt, state.marketQuotes, symbolKey]);

  return null;
}
