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
  const [hideValues, setHideValues] = useState(false);
  const [dividendEvents, setDividendEvents] = useState<DividendEventLike[]>([]);

  const symbols = useMemo(
    () => stats.holdings.map((h) => h.symbol).join(","),
    [stats.holdings]
  );

  useEffect(() => {
    if (!symbols) {
      setDividendEvents([]);
      return;
    }

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

  const passiveIncome = useMemo(
    () =>
      projectPassiveIncome(
        stats.holdings,
        dividendEvents,
        stats.holdingsValue
      ),
    [stats.holdings, stats.holdingsValue, dividendEvents]
  );

  const valueTooltip = [
    "Giá trị = vị thế đang giữ (giá TT) + lãi/lỗ đã chốt.",
    "Vị thế: " + formatMoney(stats.holdingsValue),
    "Đã chốt: " + formatMoney(stats.realizedPnl),
  ].join("\n");

  const profitTooltip = [
    "Lợi nhuận tổng gồm cổ tức, lãi/lỗ bán, phí và lãi/lỗ chưa chốt.",
    "Không gồm nạp/rút tiền.",
  ].join("\n");

  const irrTooltip = [
    "IRR — tỷ suất sinh lời nội bộ hàng năm.",
    "Tính từ mua, bán, cổ tức, phí và giá trị hiện tại.",
  ].join("\n");

  const passiveTooltip = [
    "Cổ tức dự kiến 12 tháng tới (theo lịch sử 12 tháng).",
    "Tỷ suất % trên giá trị vị thế (không gồm tiền mặt).",
  ].join("\n");

  const hasDailyQuote = stats.holdings.some((h) => h.marketPrice != null);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SnowballStatCard
        label="Giá trị"
        value={formatMoney(stats.tradingValue)}
        sub={`${formatMoney(stats.holdingsCost)} đã đầu tư`}
        icon={Wallet}
        iconClassName="bg-sky-100 text-sky-600"
        tooltip={valueTooltip}
        hidden={hideValues}
        onToggleHidden={() => setHideValues((v) => !v)}
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
        iconClassName="bg-emerald-100 text-emerald-600"
        valueClassName={
          stats.totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
        }
        badge={{
          text: formatSignedPercent(stats.totalProfitPercent),
          positive: stats.totalProfitPercent >= 0,
        }}
        tooltip={profitTooltip}
        hidden={hideValues}
      />
      <SnowballStatCard
        label="IRR"
        value={
          stats.irr != null ? `${stats.irr.toFixed(2)}%` : "—"
        }
        sub={`${formatSignedPercent(stats.profitExDivSalesPercent)} vị thế hiện tại`}
        icon={Calendar}
        iconClassName="bg-violet-100 text-violet-600"
        tooltip={irrTooltip}
        hidden={hideValues}
      />
      <SnowballStatCard
        label="Thu nhập thụ động"
        value={`${passiveIncome.yieldPercent.toFixed(1)}%`}
        sub={`${formatMoney(passiveIncome.annualIncome)} / năm`}
        icon={PiggyBank}
        iconClassName="bg-emerald-100 text-emerald-600"
        tooltip={passiveTooltip}
        hidden={hideValues}
      />
    </div>
  );
}
