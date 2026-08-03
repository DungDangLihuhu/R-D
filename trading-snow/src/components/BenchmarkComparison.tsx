"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/StatCard";
import {
  BENCHMARK_RANGES,
  buildBenchmarkComparison,
  ensureEquityCurve,
  extendBenchmarkFrom,
  hasBenchmarkTradingData,
  resolveBenchmarkWindow,
  type BenchmarkRange,
  type ComparisonResult,
  type PortfolioBenchmarkInput,
} from "@/lib/benchmark";
import {
  formatChartMonthYear,
  formatDate,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import type { PortfolioStats, Transaction } from "@/lib/types";

const GRID = "#e2e5ea";
const TICK = "#6b7280";
const TOOLTIP = {
  background: "#ffffff",
  border: "1px solid #e2e5ea",
  borderRadius: "8px",
  color: "#1a1d21",
};

function formatChartAxisPercent(value: number): string {
  const pct = value - 100;
  if (pct === 0) return "0%";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function formatIndexedReturn(value: number): string {
  const pct = value - 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function BenchmarkComparison({
  equityCurve,
  transactions,
  marketPrices,
}: {
  equityCurve: PortfolioStats["equityCurve"];
  transactions: Transaction[];
  marketPrices: Record<string, number>;
}) {
  const [range, setRange] = useState<BenchmarkRange>("all");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const curve = useMemo(() => ensureEquityCurve(equityCurve), [equityCurve]);

  const portfolioInput = useMemo<PortfolioBenchmarkInput>(
    () => ({ transactions, marketPrices }),
    [transactions, marketPrices]
  );

  const hasData = hasBenchmarkTradingData(transactions);

  useEffect(() => {
    if (!hasData) return;

    const benchmarkWindow = resolveBenchmarkWindow(
      curve,
      range,
      undefined,
      transactions
    );
    if (!benchmarkWindow) return;

    const fetchFrom = extendBenchmarkFrom(benchmarkWindow.from);

    let cancelled = false;
    const startFetch = () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    };
    const tid = globalThis.setTimeout(startFetch, 0);

    fetch(`/api/benchmark?from=${fetchFrom}&to=${benchmarkWindow.to}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setComparison(null);
          return;
        }
        const result = buildBenchmarkComparison(
          portfolioInput,
          data.points ?? [],
          benchmarkWindow
        );
        setComparison(result);
        if (!result) {
          setError("Không tải được dữ liệu S&P 500 cho khoảng thời gian này");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được dữ liệu S&P 500");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      globalThis.clearTimeout(tid);
    };
  }, [curve, transactions, range, portfolioInput, hasData]);

  if (!hasData) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">So sánh với S&P 500</h2>
        <p className="text-sm text-gray-500">
          Cần ít nhất một lệnh mua/bán để so sánh benchmark
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">So sánh với S&P 500</h2>
          <p className="text-xs text-gray-500">
            S&P 500: % tăng theo khoảng · Danh mục: (lãi đã chốt + lãi đang hold) / cost CP đang mở tại từng thời điểm
            {comparison?.clampedToHistory && (
              <> · Từ {formatDate(comparison.from)} (ngày trade đầu)</>
            )}
            {comparison && (
              <>
                {" "}
                · {formatDate(comparison.from)} – {formatDate(comparison.to)}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {BENCHMARK_RANGES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRange(item.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                range === item.value
                  ? "bg-sky-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="text-sm text-gray-500">Đang tải dữ liệu S&P 500...</p>
      )}

      {error && !loading && !comparison && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {comparison && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Danh mục"
              value={formatPercent(comparison.portfolioReturn)}
              trend={comparison.portfolioReturn >= 0 ? "up" : "down"}
              sub={
                comparison.holdingsCost > 0
                  ? `Cost mở: ${formatMoney(comparison.holdingsCost)}`
                  : comparison.realizedPnl !== 0
                    ? `Đã chốt: ${formatMoney(comparison.realizedPnl)}`
                    : undefined
              }
            />
            <StatCard
              label="S&P 500"
              value={formatPercent(comparison.sp500Return)}
              trend={comparison.sp500Return >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Vượt / thua S&P 500"
              value={formatPercent(comparison.outperformance)}
              trend={comparison.outperformance >= 0 ? "up" : "down"}
              sub={
                comparison.outperformance >= 0
                  ? "Đánh bại thị trường"
                  : "Kém thị trường"
              }
            />
          </div>

          <div className="min-w-0 w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={comparison.points.map((p) => ({
                  ...p,
                  label: formatChartMonthYear(p.date),
                }))}
              >
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: TICK, fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: TICK, fontSize: 11 }}
                  tickFormatter={(v) => formatChartAxisPercent(Number(v))}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={TOOLTIP}
                  formatter={(v, name) => {
                    if (v == null) return ["—", name === "portfolio" ? "Danh mục" : "S&P 500"];
                    return [
                      formatIndexedReturn(Number(v)),
                      name === "portfolio" ? "Danh mục" : "S&P 500",
                    ];
                  }}
                  labelFormatter={(_, payload) => {
                    const date = payload?.[0]?.payload?.date as string | undefined;
                    return date ? formatDate(date) : "";
                  }}
                />
                <Legend
                  formatter={(value) =>
                    value === "portfolio" ? "Danh mục" : "S&P 500"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                  name="portfolio"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sp500"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="sp500"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
