"use client";

import { HoldingsTable } from "@/components/HoldingsTable";
import { PriceRefresh } from "@/components/PriceRefresh";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function PortfolioPage() {
  const { stats } = useApp();
  const missingPrices = stats.holdings.filter((h) => !h.marketPrice).length;

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
      {missingPrices > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {missingPrices} mã chưa có giá thị trường (đang hiển thị giá vốn). Bấm{" "}
          <strong>Refresh</strong> hoặc{" "}
          <a href="/api/quotes?check=1" target="_blank" rel="noreferrer" className="underline">
            kiểm tra API
          </a>
          . Cổ phiếu .PA cần Yahoo — Finnhub free không hỗ trợ.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Mini label="Giá trị CP" value={formatMoney(
          stats.holdings.reduce(
            (s, h) => s + h.quantity * (h.marketPrice ?? h.avgCost),
            0
          )
        )} />
        <Mini label="Tiền mặt" value={formatMoney(stats.cashBalance)} />
        <Mini label="Tổng giá trị" value={formatMoney(stats.portfolioValue)} />
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
