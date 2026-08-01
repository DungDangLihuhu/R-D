"use client";

import { BenchmarkComparison } from "@/components/BenchmarkComparison";
import { EquityChart, MonthlyPnlChart } from "@/components/Charts";
import { StatCard } from "@/components/StatCard";
import { useApp } from "@/context/AppContext";
import { formatMoney } from "@/lib/format";

export default function AnalyticsPage() {
  const { stats, state, activePortfolioId } = useApp();
  const transactions = state.transactions.filter(
    (t) => t.portfolioId === activePortfolioId
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Thống kê</h1>
        <p className="text-sm text-gray-500">
          P&L theo tháng, so sánh S&P 500
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
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-4 font-semibold">P&L theo tháng</h2>
          <MonthlyPnlChart data={stats.monthlyPnl} />
        </div>
        <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-4 font-semibold">Equity curve</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
      </div>

      <BenchmarkComparison
        equityCurve={stats.equityCurve}
        transactions={transactions}
      />
    </div>
  );
}
