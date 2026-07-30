"use client";

import { EquityChart, MonthlyPnlChart } from "@/components/Charts";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

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
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <h2 className="border-b border-zinc-800 px-4 py-3 font-semibold">
            Lệnh đã chốt (gần nhất)
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-2">Ngày</th>
                <th className="px-4 py-2">Mã</th>
                <th className="px-4 py-2 text-right">P&L</th>
                <th className="px-4 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.closedTrades].reverse().slice(0, 20).map((t, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-4 py-2">{formatDate(t.date)}</td>
                  <td className="px-4 py-2">{t.symbol}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatMoney(t.pnl)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatPercent(t.pnlPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
