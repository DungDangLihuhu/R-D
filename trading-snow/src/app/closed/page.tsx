"use client";

import { ClosedTradesTable } from "@/components/ClosedTradesTable";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatMoney, formatPercent } from "@/lib/format";

export default function ClosedTradesPage() {
  const { stats } = useApp();

  const grossWin = stats.closedTrades
    .filter((t) => t.pnl > 0)
    .reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(
    stats.closedTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lệnh đã đóng"
        description="Tổng lãi/lỗ từ các lệnh bán đã chốt"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Tổng lãi/lỗ đã chốt"
          value={formatMoney(stats.realizedPnl)}
          trend={stats.realizedPnl >= 0 ? "up" : "down"}
        />
        <StatCard label="Số lệnh đóng" value={String(stats.totalTrades)} />
        <StatCard
          label="Thắng / Thua"
          value={`${stats.winCount} / ${stats.lossCount}`}
        />
        <StatCard
          label="Tỷ lệ thắng"
          value={formatPercent(stats.winRate)}
          trend={stats.winRate >= 50 ? "up" : "down"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Tổng lãi (lệnh thắng)" value={formatMoney(grossWin)} trend="up" />
        <StatCard label="Tổng lỗ (lệnh thua)" value={formatMoney(-grossLoss)} trend="down" />
        <StatCard
          label="Lãi TB / Lỗ TB"
          value={`${formatMoney(stats.avgWin)} / ${formatMoney(stats.avgLoss)}`}
        />
      </div>

      <ClosedTradesTable trades={stats.closedTrades} />
    </div>
  );
}
