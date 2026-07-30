"use client";

import { EquityChart } from "@/components/Charts";
import { DataTools } from "@/components/DataTools";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function DashboardPage() {
  const { stats } = useApp();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tổng quan</h1>
          <p className="text-sm text-zinc-500">
            Theo dõi P&L, win rate và đường vốn — lưu local trên trình duyệt
          </p>
        </div>
        <DataTools />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Giá trị danh mục"
          value={formatMoney(stats.portfolioValue)}
          sub={`Tiền mặt: ${formatMoney(stats.cashBalance)}`}
        />
        <StatCard
          label="Tổng P&L"
          value={formatMoney(stats.totalPnl)}
          trend={stats.totalPnl >= 0 ? "up" : "down"}
          sub={`Đã chốt: ${formatMoney(stats.realizedPnl)}`}
        />
        <StatCard
          label="Win rate"
          value={`${stats.winRate.toFixed(1)}%`}
          sub={`${stats.winCount}W / ${stats.lossCount}L · ${stats.totalTrades} lệnh`}
        />
        <StatCard
          label="Profit factor"
          value={
            stats.profitFactor === Infinity
              ? "∞"
              : stats.profitFactor.toFixed(2)
          }
          sub={`Avg win ${formatMoney(stats.avgWin)} · loss ${formatMoney(stats.avgLoss)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Đường vốn (Equity curve)</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="font-semibold">Tóm tắt</h2>
          <Row label="Cổ tức" value={formatMoney(stats.totalDividends)} />
          <Row label="Nạp ròng" value={formatMoney(stats.totalDeposits - stats.totalWithdrawals)} />
          <Row
            label="Lãi chưa chốt"
            value={formatMoney(stats.unrealizedPnl)}
            color={stats.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
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
  color = "text-zinc-200",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
