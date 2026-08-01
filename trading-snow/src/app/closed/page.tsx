"use client";

import { ClosedTradesTable } from "@/components/ClosedTradesTable";
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
      <div>
        <h1 className="text-2xl font-bold">Lệnh đã đóng</h1>
        <p className="text-sm text-gray-500">
          Tổng lãi/lỗ từ các lệnh bán đã chốt (realized P&L)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Tổng lãi (lệnh thắng)</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">
            {formatMoney(grossWin)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Tổng lỗ (lệnh thua)</p>
          <p className="mt-1 text-lg font-semibold text-rose-600">
            {formatMoney(-grossLoss)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Lãi TB / Lỗ TB</p>
          <p className="mt-1 text-lg font-semibold">
            <span className="text-emerald-600">{formatMoney(stats.avgWin)}</span>
            <span className="text-gray-500"> / </span>
            <span className="text-rose-600">{formatMoney(stats.avgLoss)}</span>
          </p>
        </div>
      </div>

      <ClosedTradesTable trades={stats.closedTrades} />
    </div>
  );
}
