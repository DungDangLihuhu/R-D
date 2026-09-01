"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { SnowballStatCard } from "@/components/SnowballStatCard";
import type { PortfolioStats } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import {
  projectPassiveIncome,
  type DividendEventLike,
} from "@/lib/portfolio-snowball";

function formatSignedMoney(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${formatMoney(Math.abs(value))}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function DashboardMetrics({ stats }: { stats: PortfolioStats }) {
  const [dividendEvents, setDividendEvents] = useState<DividendEventLike[]>([]);

  const symbols = useMemo(
    () => stats.holdings.map((h) => h.symbol).join(","),
    [stats.holdings]
  );

  useEffect(() => {
    if (!symbols) return;

    let cancelled = false;
    fetch(`/api/dividends?symbols=${encodeURIComponent(symbols)}`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data: { events?: DividendEventLike[] }) => {
        if (!cancelled) setDividendEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setDividendEvents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const effectiveDividendEvents = useMemo(
    () => (symbols ? dividendEvents : []),
    [symbols, dividendEvents]
  );

  const passiveIncome = useMemo(
    () =>
      projectPassiveIncome(
        stats.holdings,
        effectiveDividendEvents,
        stats.holdingsValue
      ),
    [stats.holdings, stats.holdingsValue, effectiveDividendEvents]
  );

  const hasDailyQuote = stats.holdings.some((h) => h.marketPrice != null);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <SnowballStatCard
        label="Giá trị"
        value={formatMoney(stats.holdingsValue)}
        sub={`${formatMoney(stats.holdingsCost)} đã đầu tư`}
        icon={Wallet}
        iconClassName="app-icon-sky"
      />
      <SnowballStatCard
        label="Lợi nhuận"
        value={formatSignedMoney(stats.totalProfit)}
        sub={
          hasDailyQuote
            ? `${formatSignedMoney(stats.dailyHoldingsProfit)} ${formatSignedPercent(stats.dailyHoldingsProfitPercent)} phiên gần nhất`
            : `Đã chốt: ${formatMoney(stats.realizedPnl)}`
        }
        icon={TrendingUp}
        iconClassName="app-icon-emerald"
        valueClassName={
          stats.totalProfit >= 0 ? "text-emerald-600 glow-profit" : "text-rose-600 glow-loss"
        }
        badge={{
          text: formatSignedPercent(stats.totalProfitPercent),
          positive: stats.totalProfitPercent >= 0,
        }}
      />
      <SnowballStatCard
        label="IRR"
        value={
          stats.irr != null ? `${stats.irr.toFixed(2)}%` : "—"
        }
        sub={`${formatSignedPercent(stats.profitExDivSalesPercent)} vị thế hiện tại`}
        icon={Calendar}
        iconClassName="app-icon-violet"
      />
      <SnowballStatCard
        label="Thu nhập thụ động"
        value={`${passiveIncome.yieldPercent.toFixed(1)}%`}
        sub={`${formatMoney(passiveIncome.annualIncome)} / năm`}
        icon={PiggyBank}
        iconClassName="app-icon-emerald"
      />
    </div>
  );
}
