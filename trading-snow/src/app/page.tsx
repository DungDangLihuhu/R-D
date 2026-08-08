"use client";

import dynamic from "next/dynamic";
import { DashboardMetrics } from "@/components/DashboardMetrics";
import { DataTools } from "@/components/DataTools";
import { PageHeader } from "@/components/PageHeader";
import { PriceRefresh } from "@/components/PriceRefresh";
import { SyncPanel } from "@/components/SyncPanel";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

const EquityChart = dynamic(
  () => import("@/components/Charts").then((m) => m.EquityChart),
  {
    loading: () => <div className="app-skeleton h-64" />,
  }
);

export default function DashboardPage() {
  const { stats } = useApp();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan"
        description="Theo dõi P&L, win rate và lợi nhuận ròng — đồng bộ cloud khi bật Upstash"
        actions={
          <>
            <PriceRefresh />
            <DataTools />
          </>
        }
      />

      <SyncPanel />

      <DashboardMetrics stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="app-card min-w-0 lg:col-span-2">
          <h2 className="app-card-section-title">Lợi nhuận ròng</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
        <div className="app-card space-y-3">
          <h2 className="app-card-section-title">Tóm tắt</h2>
          <Row label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
          <Row
            label="Hệ số lợi nhuận"
            value={
              stats.profitFactor === Infinity
                ? "∞"
                : stats.profitFactor.toFixed(2)
            }
          />
          <Row label="Cổ tức" value={formatMoney(stats.totalDividends)} />
          <Row label="Nạp ròng" value={formatMoney(stats.netCapital)} />
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
  color = "text-app-text",
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
