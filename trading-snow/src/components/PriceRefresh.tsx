"use client";

import { RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatDate } from "@/lib/format";

export function PriceRefresh({ compact }: { compact?: boolean }) {
  const { state, stats, priceLoading, refreshPrices } = useApp();

  if (stats.holdings.length === 0) return null;

  const updated = state.pricesUpdatedAt
    ? formatDate(state.pricesUpdatedAt)
    : "Chưa cập nhật";

  return (
    <button
      onClick={() => refreshPrices()}
      disabled={priceLoading}
      className={`flex items-center gap-2 rounded-lg border border-zinc-700 text-sm hover:bg-zinc-900 disabled:opacity-50 ${
        compact ? "px-2 py-1" : "px-3 py-2"
      }`}
      title="Lấy giá từ Yahoo Finance"
    >
      <RefreshCw className={`h-4 w-4 ${priceLoading ? "animate-spin" : ""}`} />
      {!compact && (
        <span className="text-zinc-400">
          {priceLoading ? "Đang lấy giá..." : `Giá: ${updated}`}
        </span>
      )}
    </button>
  );
}
