"use client";

import { useEffect, useState } from "react";
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
  resolveBenchmarkWindow,
  type BenchmarkRange,
  type ComparisonResult,
} from "@/lib/benchmark";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { PortfolioStats, Transaction } from "@/lib/types";

const GRID = "#e2e5ea";
const TICK = "#6b7280";
const TOOLTIP = {
  background: "#ffffff",
  border: "1px solid #e2e5ea",
  borderRadius: "8px",
  color: "#1a1d21",
};

export function BenchmarkComparison({
  equityCurve,
  transactions,
}: {
  equityCurve: PortfolioStats["equityCurve"];
  transactions: Transaction[];
}) {
  const [range, setRange] = useState<BenchmarkRange>("all");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (equityCurve.length < 2) {
      setComparison(null);
      return;
    }

    const sorted = [...equityCurve].sort((a, b) => a.date.localeCompare(b.date));
    const window = resolveBenchmarkWindow(sorted, range);
    if (!window) {
      setComparison(null);
      setError("Không đủ dữ liệu cho khung thời gian này");
      return;
    }

    const historyStart = sorted[0].date.slice(0, 10);

    setLoading(true);
    setError(null);

    fetch(`/api/benchmark?from=${historyStart}&to=${window.to}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setComparison(null);
          return;
        }
        const result = buildBenchmarkComparison(
          sorted,
          data.points ?? [],
          transactions,
          window,
        );
        if (!result) {
          setError("Không đủ dữ liệu để so sánh");
          setComparison(null);
          return;
        }
        setComparison(result);
      })
      .catch(() => setError("Không tải được dữ liệu S&P 500"))
      .finally(() => setLoading(false));
  }, [
    equityCurve,
    transactions,
    range,
  ]);

  if (equityCurve.length < 2) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">So sánh với S&P 500</h2>
        <p className="text-sm text-gray-500">
          Cần ít nhất 2 điểm trên đường vốn để so sánh benchmark
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
            Cùng dòng tiền: mỗi lần mua/nạp = bỏ vào S&P 500 · 100 = hoà vốn
            {comparison && (
              <>
                {" "}
                · {formatDate(comparison.from)} – {formatDate(comparison.to)}
                {" "}
                · Vốn bỏ ra: {formatMoney(comparison.investedCapital)}
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

      {error && !loading && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {comparison && !loading && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Lãi trên vốn (danh mục)"
              value={formatPercent(comparison.portfolioReturn)}
              trend={comparison.portfolioReturn >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Lãi trên vốn (S&P 500)"
              value={formatPercent(comparison.sp500Return)}
              trend={comparison.sp500Return >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Vượt / thua benchmark"
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
                label: p.date.slice(5),
              }))}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: TICK, fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: TICK, fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={TOOLTIP}
                formatter={(v, name) => [
                  `${Number(v ?? 0).toFixed(1)} (${Number(v ?? 0) >= 100 ? "+" : ""}${(Number(v ?? 0) - 100).toFixed(1)}%)`,
                  name === "portfolio" ? "Danh mục" : "S&P 500",
                ]}
                labelFormatter={(l) => `Ngày: ${l}`}
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
              />
              <Line
                type="monotone"
                dataKey="sp500"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
