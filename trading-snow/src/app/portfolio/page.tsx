"use client";

import { HoldingsTable } from "@/components/HoldingsTable";
import { PageHeader } from "@/components/PageHeader";
import { PriceRefresh } from "@/components/PriceRefresh";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function PortfolioPage() {
  const { stats } = useApp();
  const missingPrices = stats.allHoldings.filter((h) => !h.marketPrice).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh mục"
        description="Giá realtime từ Yahoo Finance (gồm pre-market & after-hours) · tự refresh mỗi 5 phút"
        actions={<PriceRefresh />}
      />
      {missingPrices > 0 && (
        <div className="app-alert-warning">
          {missingPrices} mã chưa có giá thị trường (đang hiển thị giá vốn). Bấm{" "}
          <strong>Refresh</strong> hoặc{" "}
          <a href="/api/quotes?check=1" target="_blank" rel="noreferrer" className="underline">
            kiểm tra API
          </a>
          . Cổ phiếu .PA cần Yahoo — Finnhub free không hỗ trợ.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Tổng giá trị"
          value={formatMoney(
            stats.holdings.reduce(
              (s, h) => s + h.quantity * (h.marketPrice ?? h.avgCost),
              0
            )
          )}
        />
        <StatCard label="Tiền vốn" value={formatMoney(stats.cashBalance)} />
        <StatCard
          label="Lợi nhuận ròng"
          value={formatMoney(stats.totalProfit)}
          trend={stats.totalProfit >= 0 ? "up" : "down"}
        />
      </div>
      <HoldingsTable />
    </div>
  );
}
