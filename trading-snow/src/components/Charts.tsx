"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioStats } from "@/lib/types";
import {
  downsampleMonthly,
  formatAxisMoney,
  formatChartMonthYear,
  formatDate,
  formatMonthKey,
  formatMoney,
} from "@/lib/format";
import { useChartTheme } from "@/lib/chart-theme";

const PROFIT_COLOR = "#10b981";
const LOSS_COLOR = "#f43f5e";

export function EquityChart({ data }: { data: PortfolioStats["profitCurve"] }) {
  const theme = useChartTheme();

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-app-muted">
        Cần thêm giao dịch để vẽ lợi nhuận ròng
      </div>
    );
  }

  const chartData = downsampleMonthly(
    [...data].sort((a, b) => a.date.localeCompare(b.date))
  ).map((d) => ({
    ...d,
    label: formatChartMonthYear(d.date),
  }));

  return (
    <div className="min-w-0 w-full">
      <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.tick, fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickFormatter={formatAxisMoney}
        />
        <Tooltip
          contentStyle={theme.tooltip}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "Lợi nhuận ròng"]}
          labelFormatter={(_, payload) => {
            const date = payload?.[0]?.payload?.date as string | undefined;
            return date ? formatDate(date) : "";
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0ea5e9"
          fill="url(#eq)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}

export function MonthlyPnlChart({ data }: { data: PortfolioStats["monthlyPnl"] }) {
  const theme = useChartTheme();

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-app-muted">
        Chưa có P&L theo tháng
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonthKey(d.month),
  }));

  return (
    <div className="min-w-0 w-full">
      <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.tick, fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          tick={{ fill: theme.tick, fontSize: 11 }}
          tickFormatter={formatAxisMoney}
        />
        <Tooltip
          contentStyle={theme.tooltip}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "P&L"]}
          labelFormatter={(label) => `Tháng ${label}`}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {chartData.map((d) => (
            <Cell key={d.month} fill={d.pnl >= 0 ? PROFIT_COLOR : LOSS_COLOR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
