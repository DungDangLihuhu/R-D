"use client";

import { RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatDate } from "@/lib/format";

export function PriceRefresh({ compact }: { compact?: boolean }) {
  const { state, stats, priceLoading, quoteUnresolved, refreshPrices } = useApp();

  if (stats.holdings.length === 0) return null;

  const updated = state.pricesUpdatedAt
    ? formatDate(state.pricesUpdatedAt)
    : "Chưa cập nhật";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => refreshPrices(undefined, { notify: true })}
        disabled={priceLoading}
        className={`flex items-center gap-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-50 ${
          compact ? "px-2 py-1" : "px-3 py-2"
        }`}
        title={
          quoteUnresolved.length > 0
            ? `Chưa có giá: ${quoteUnresolved.join(", ")}`
            : "Lấy giá từ Yahoo / backup API"
        }
      >
        <RefreshCw className={`h-4 w-4 ${priceLoading ? "animate-spin" : ""}`} />
        {!compact && (
          <span className="text-gray-500">
            {priceLoading
              ? "Đang lấy giá..."
              : quoteUnresolved.length > 0
                ? `${quoteUnresolved.length} mã lỗi · ${updated}`
                : `Giá: ${updated}`}
          </span>
        )}
      </button>
      {!compact && quoteUnresolved.length > 0 && (
        <a
          href="/api/quotes?check=1"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-amber-600 underline"
        >
          Kiểm tra API
        </a>
      )}
    </div>
  );
}
