"use client";

import { HoldingsTable } from "@/components/HoldingsTable";
import { MissingSplitsNotice } from "@/components/MissingSplitsNotice";
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
      <MissingSplitsNotice />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Giá trị cổ phiếu"
          value={formatMoney(stats.holdingsValue)}
          sub={
            stats.cashBalance >= 0
              ? `Tổng tài sản ${formatMoney(stats.holdingsValue + stats.cashBalance)} (gồm tiền mặt)`
              : undefined
          }
        />
        <StatCard
          label="Tiền mặt"
          value={formatMoney(stats.cashBalance)}
          sub={stats.cashBalance < 0 ? "Âm: còn thiếu lệnh nạp tiền" : "Nạp − rút − mua + bán + cổ tức"}
        />
        <StatCard
          label="Lợi nhuận ròng"
          value={formatMoney(stats.totalProfit)}
          trend={stats.totalProfit >= 0 ? "up" : "down"}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      <HoldingsTable />
    </div>
  );
}
