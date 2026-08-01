"use client";

import { HoldingsTable } from "@/components/HoldingsTable";
import { PriceRefresh } from "@/components/PriceRefresh";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function PortfolioPage() {
  const { stats } = useApp();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Danh mục</h1>
          <p className="text-sm text-gray-500">
            Giá realtime từ Yahoo Finance · tự refresh mỗi 5 phút
          </p>
        </div>
        <PriceRefresh />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Mini label="Giá trị CP" value={formatMoney(
          stats.holdings.reduce(
            (s, h) => s + h.quantity * (h.marketPrice ?? h.avgCost),
            0
          )
        )} />
        <Mini label="Tiền mặt" value={formatMoney(stats.cashBalance)} />
        <Mini label="Tổng NAV" value={formatMoney(stats.portfolioValue)} />
      </div>
      <HoldingsTable />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
