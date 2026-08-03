"use client";

import { useEffect, useRef } from "react";
import { toTradingViewSymbol } from "@/lib/tradingview";

export function TradingViewChart({
  symbol,
  exchange,
  height = 520,
}: {
  symbol: string;
  exchange?: string | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tvSymbol = toTradingViewSymbol(symbol, exchange);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = `${height - 28}px`;
    widget.style.width = "100%";
    container.appendChild(widget);

    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright text-center text-[10px] text-gray-400 py-1";
    copyright.innerHTML =
      '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank" class="text-gray-400 hover:text-sky-600">TradingView</a>';
    container.appendChild(copyright);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: "100%",
      height: height - 28,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      locale: "vi_VN",
      enable_publishing: false,
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [tvSymbol, height]);

  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
      style={{ height }}
    >
      <div
        ref={containerRef}
        className="tradingview-widget-container h-full w-full"
      />
    </div>
  );
}
