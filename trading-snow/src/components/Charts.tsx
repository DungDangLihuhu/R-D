"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioStats } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export function EquityChart({ data }: { data: PortfolioStats["equityCurve"] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Cần thêm giao dịch để vẽ đường vốn
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: d.date.slice(0, 10),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "Vốn"]}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#38bdf8"
          fill="url(#eq)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MonthlyPnlChart({ data }: { data: PortfolioStats["monthlyPnl"] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Chưa có P&L theo tháng
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "P&L"]}
        />
        <Bar
          dataKey="pnl"
          fill="#38bdf8"
          radius={[4, 4, 0, 0]}
          activeBar={{ fill: "#7dd3fc" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
