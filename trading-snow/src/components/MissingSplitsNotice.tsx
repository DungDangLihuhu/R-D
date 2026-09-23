"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { formatDate, formatShares, formatSplitRatio } from "@/lib/format";
import { findMissingSplits } from "@/lib/price-history";
import { toast } from "@/lib/toast-store";

/**
 * Split Yahoo đã ghi nhận mà lệnh chưa có — số cổ và giá vốn/cp của mã đó đang lệch đúng
 * bằng hệ số split. Thêm lệnh split một chạm thay vì tự tra ngày và tỷ lệ.
 */
export function MissingSplitsNotice() {
  const { state, activePortfolioId, addTransaction } = useApp();
  const transactions = useMemo(
    () => state.transactions.filter((t) => t.portfolioId === activePortfolioId),
    [state.transactions, activePortfolioId]
  );
  const { raw } = usePriceHistory(transactions);
  const missing = useMemo(
    () => (raw ? findMissingSplits(raw, transactions) : []),
    [raw, transactions]
  );

  if (missing.length === 0) return null;

  return (
    <div className="app-alert-warning space-y-2">
      <p className="font-medium">Có split chưa ghi — số cổ và giá vốn/cp của mã này đang lệch</p>
      <ul className="space-y-2">
        {missing.map((m) => (
          <li
            key={`${m.symbol}-${m.date}`}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              {m.symbol} chia tách {formatSplitRatio(m.ratio)} ngày {formatDate(m.date)} · đang
              ghi {formatShares(m.sharesBefore)} cp trước ngày đó
            </span>
            <button
              type="button"
              className="app-btn-secondary px-2.5 py-1 text-xs"
              onClick={() => {
                addTransaction({
                  portfolioId: activePortfolioId,
                  type: "SPLIT",
                  symbol: m.symbol,
                  assetType: "STOCK",
                  quantity: m.ratio,
                  price: 0,
                  fee: 0,
                  date: `${m.date}T00:00:00.000Z`,
                  notes: "Split theo dữ liệu Yahoo",
                });
                toast.success(`Đã thêm split ${m.symbol} ${formatSplitRatio(m.ratio)}`);
              }}
            >
              Thêm lệnh split
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
