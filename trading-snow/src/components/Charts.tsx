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

const GRID = "#e2e5ea";
const TICK = "#6b7280";
const TOOLTIP = {
  background: "#ffffff",
  border: "1px solid #e2e5ea",
  borderRadius: "8px",
  color: "#1a1d21",
};

export function EquityChart({ data }: { data: PortfolioStats["equityCurve"] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Cần thêm giao dịch để vẽ đường vốn
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: d.date.slice(0, 10),
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
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} />
        <YAxis
          tick={{ fill: TICK, fontSize: 11 }}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={TOOLTIP}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "Vốn"]}
        />
        <Area
          type="monotone"
          dataKey="equity"
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
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500">
        Chưa có P&L theo tháng
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full">
      <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fill: TICK, fontSize: 11 }} />
        <YAxis
          tick={{ fill: TICK, fontSize: 11 }}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          contentStyle={TOOLTIP}
          formatter={(v) => [formatMoney(Number(v ?? 0)), "P&L"]}
        />
        <Bar
          dataKey="pnl"
          fill="#0ea5e9"
          radius={[4, 4, 0, 0]}
          activeBar={{ fill: "#38bdf8" }}
        />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
