"use client";

import Link from "next/link";
import { EquityChart, MonthlyPnlChart } from "@/components/Charts";
import { ClosedTradesTable } from "@/components/ClosedTradesTable";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function AnalyticsPage() {
  const { stats } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Thống kê</h1>
        <p className="text-sm text-zinc-500">
          P&L theo tháng, lệnh đã chốt, metrics trading
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lệnh đã chốt" value={String(stats.totalTrades)} />
        <StatCard
          label="Lãi TB / lệnh thắng"
          value={formatMoney(stats.avgWin)}
          trend="up"
        />
        <StatCard
          label="Lỗ TB / lệnh thua"
          value={formatMoney(stats.avgLoss)}
          trend="down"
        />
        <StatCard
          label="Realized P&L"
          value={formatMoney(stats.realizedPnl)}
          trend={stats.realizedPnl >= 0 ? "up" : "down"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 font-semibold">P&L theo tháng</h2>
          <MonthlyPnlChart data={stats.monthlyPnl} />
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="mb-4 font-semibold">Equity curve</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
      </div>

      {stats.closedTrades.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Lệnh đã chốt (10 gần nhất)</h2>
            <Link
              href="/closed"
              className="text-sm text-sky-400 hover:text-sky-300"
            >
              Xem tất cả →
            </Link>
          </div>
          <ClosedTradesTable trades={stats.closedTrades.slice(-10)} showFooter={false} />
        </div>
      )}
    </div>
  );
}
