"use client";

import { useMemo, useState } from "react";
import { Calendar, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { SnowballStatCard } from "@/components/SnowballStatCard";
import type { PortfolioStats } from "@/lib/types";
import { formatMoney } from "@/lib/format";

function formatSignedMoney(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatMoney(Math.abs(value))}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function DashboardMetrics({ stats }: { stats: PortfolioStats }) {
  const [hideValues, setHideValues] = useState(false);

  const metrics = useMemo(() => {
    const netInvested = stats.totalDeposits - stats.totalWithdrawals;
    const totalReturnPct =
      netInvested > 0 ? (stats.totalPnl / netInvested) * 100 : 0;

    const curve = stats.equityCurve;
    let recentChange = 0;
    let recentChangePct = 0;
    if (curve.length >= 2) {
      const last = curve[curve.length - 1];
      const prev = curve[curve.length - 2];
      recentChange = last.equity - prev.equity;
      recentChangePct = prev.equity > 0 ? (recentChange / prev.equity) * 100 : 0;
    }

    let annualizedReturn = 0;
    if (curve.length >= 2 && netInvested > 0) {
      const start = curve[0];
      const end = curve[curve.length - 1];
      const days =
        (new Date(end.date).getTime() - new Date(start.date).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days >= 30 && end.equity > 0) {
        annualizedReturn =
          (Math.pow(end.equity / netInvested, 365 / days) - 1) * 100;
      }
    }

    const holdingsCost = stats.holdings.reduce((s, h) => s + h.totalCost, 0);
    const holdingsReturnPct =
      holdingsCost > 0 ? (stats.unrealizedPnl / holdingsCost) * 100 : 0;

    const dividendYield =
      stats.portfolioValue > 0
        ? (stats.totalDividends / stats.portfolioValue) * 100
        : 0;

    return {
      netInvested,
      totalReturnPct,
      recentChange,
      recentChangePct,
      annualizedReturn,
      holdingsReturnPct,
      dividendYield,
    };
  }, [stats]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SnowballStatCard
        label="Giá trị"
        value={formatMoney(stats.portfolioValue)}
        sub={`${formatMoney(metrics.netInvested)} đã đầu tư`}
        icon={Wallet}
        iconClassName="bg-sky-500/20 text-sky-400"
        tooltip="Tổng giá trị danh mục = tiền mặt + vị thế theo giá thị trường"
        hidden={hideValues}
        onToggleHidden={() => setHideValues((v) => !v)}
      />
      <SnowballStatCard
        label="Lợi nhuận"
        value={formatSignedMoney(stats.totalPnl)}
        sub={
          curveHasChange(stats)
            ? `${formatSignedMoney(metrics.recentChange)} ${formatSignedPercent(metrics.recentChangePct)} kể từ GD gần nhất`
            : `Đã chốt: ${formatMoney(stats.realizedPnl)}`
        }
        icon={TrendingUp}
        iconClassName="bg-emerald-500/20 text-emerald-400"
        badge={{
          text: formatSignedPercent(metrics.totalReturnPct),
          positive: metrics.totalReturnPct >= 0,
        }}
        tooltip="Lợi nhuận tổng = đã chốt + chưa chốt"
        hidden={hideValues}
      />
      <SnowballStatCard
        label="IRR"
        value={`${metrics.annualizedReturn.toFixed(2)}%`}
        sub={`${formatSignedPercent(metrics.holdingsReturnPct)} vị thế hiện tại`}
        icon={Calendar}
        iconClassName="bg-violet-500/20 text-violet-400"
        tooltip="Tỷ suất sinh lời nội bộ ước tính từ đường vốn và vốn đã nạp"
        hidden={hideValues}
      />
      <SnowballStatCard
        label="Thu nhập thụ động"
        value={`${metrics.dividendYield.toFixed(1)}%`}
        sub={`${formatMoney(stats.totalDividends)} cổ tức đã nhận`}
        icon={PiggyBank}
        iconClassName="bg-emerald-500/20 text-emerald-400"
        tooltip="Tỷ suất cổ tức trên giá trị danh mục hiện tại"
        hidden={hideValues}
      />
    </div>
  );
}

function curveHasChange(stats: PortfolioStats): boolean {
  return stats.equityCurve.length >= 2;
}
