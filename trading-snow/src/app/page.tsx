"use client";

import { DashboardMetrics } from "@/components/DashboardMetrics";
import { EquityChart } from "@/components/Charts";
import { DataTools } from "@/components/DataTools";
import { PriceRefresh } from "@/components/PriceRefresh";
import { SyncPanel } from "@/components/SyncPanel";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function DashboardPage() {
  const { stats } = useApp();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="text-sm text-gray-500">
            Theo dõi P&L, win rate và lợi nhuận ròng — đồng bộ cloud khi bật Upstash
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriceRefresh />
          <DataTools />
        </div>
      </div>

      <SyncPanel />

      <DashboardMetrics stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Lợi nhuận ròng</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-semibold">Tóm tắt</h2>
          <Row label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
          <Row
            label="Profit factor"
            value={
              stats.profitFactor === Infinity
                ? "∞"
                : stats.profitFactor.toFixed(2)
            }
          />
          <Row label="Cổ tức" value={formatMoney(stats.totalDividends)} />
          <Row label="Nạp ròng" value={formatMoney(stats.totalDeposits - stats.totalWithdrawals)} />
          <Row
            label="Lãi chưa chốt"
            value={formatMoney(stats.unrealizedPnl)}
            color={stats.unrealizedPnl >= 0 ? "text-emerald-600" : "text-rose-600"}
          />
          <Row label="Vị thế mở" value={String(stats.holdings.length)} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color = "text-gray-800",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
