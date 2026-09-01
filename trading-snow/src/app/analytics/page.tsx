"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { filterHiddenTransactions } from "@/lib/hidden-symbols";
import { formatMoney } from "@/lib/format";

const BenchmarkComparison = dynamic(
  () =>
    import("@/components/BenchmarkComparison").then((m) => m.BenchmarkComparison),
  {
    loading: () => <div className="app-skeleton h-80" />,
  }
);

const EquityChart = dynamic(
  () => import("@/components/Charts").then((m) => m.EquityChart),
  {
    loading: () => <div className="app-skeleton h-64" />,
  }
);

const MonthlyPnlChart = dynamic(
  () => import("@/components/Charts").then((m) => m.MonthlyPnlChart),
  {
    loading: () => <div className="app-skeleton h-64" />,
  }
);

export default function AnalyticsPage() {
  const { stats, state, activePortfolioId, hiddenSymbols } = useApp();
  const transactions = useMemo(
    () =>
      filterHiddenTransactions(
        state.transactions,
        activePortfolioId,
        hiddenSymbols
      ).filter((t) => t.portfolioId === activePortfolioId),
    [state.transactions, activePortfolioId, hiddenSymbols]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thống kê"
        description="P&L theo tháng, so sánh S&P 500"
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
          label="Lãi đã chốt"
          value={formatMoney(stats.realizedPnl)}
          trend={stats.realizedPnl >= 0 ? "up" : "down"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="app-card min-w-0">
          <h2 className="app-card-section-title">P&L theo tháng</h2>
          <MonthlyPnlChart data={stats.monthlyPnl} />
        </div>
        <div className="app-card min-w-0">
          <h2 className="app-card-section-title">Lợi nhuận ròng</h2>
          <EquityChart data={stats.equityCurve} />
        </div>
      </div>

      <BenchmarkComparison
        equityCurve={stats.equityCurve}
        transactions={transactions}
        marketPrices={state.marketPrices}
      />
    </div>
  );
}
