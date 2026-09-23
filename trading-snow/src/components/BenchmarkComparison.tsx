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
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { fetchJson } from "@/lib/fetch-cache";
import { useChartTheme } from "@/lib/chart-theme";
import type { PortfolioStats, Transaction } from "@/lib/types";
import type { HistoryPoint } from "@/lib/yahoo";

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
  const [bench, setBench] = useState<
    { url: string; points: HistoryPoint[] } | { url: string; error: string } | null
  >(null);
  const [shown, setShown] = useState<ComparisonResult | null>(null);
  const chartTheme = useChartTheme();
  const { series: closes, status: historyStatus } = usePriceHistory(transactions);

  const curve = useMemo(() => ensureEquityCurve(equityCurve), [equityCurve]);

  const portfolioSignature = useMemo(() => {
    const txSig = [...transactions]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (t) =>
          `${t.id}:${t.date}:${t.type}:${t.symbol}:${t.quantity}:${t.price}:${t.fee}`
      )
      .join("|");
    const priceSig = Object.keys(marketPrices)
      .sort()
      .map((k) => `${k}:${marketPrices[k]}`)
      .join("|");
    return `${txSig};;${priceSig}`;
  }, [transactions, marketPrices]);

  const portfolioInput = useMemo<PortfolioBenchmarkInput>(
    () => ({ transactions, marketPrices }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chủ ý: chỉ tạo lại khi nội dung đổi, không phải khi identity mảng đổi
    [portfolioSignature]
  );

  const hasData = hasBenchmarkTradingData(transactions);

  const benchmarkWindow = useMemo(
    () =>
      hasData ? resolveBenchmarkWindow(curve, range, undefined, transactions) : null,
    [hasData, curve, range, transactions]
  );

  const benchUrl = benchmarkWindow
    ? `/api/benchmark?from=${extendBenchmarkFrom(benchmarkWindow.from)}&to=${benchmarkWindow.to}`
    : "";

  useEffect(() => {
    if (!benchUrl) return;
    let cancelled = false;

    fetchJson<{ points?: HistoryPoint[]; error?: string }>(benchUrl, {
      ttlMs: 15 * 60 * 1000,
    })
      .then((data) => {
        if (cancelled) return;
        setBench(
          data.error
            ? { url: benchUrl, error: data.error }
            : { url: benchUrl, points: data.points ?? [] }
        );
      })
      .catch(() => {
        if (!cancelled) setBench({ url: benchUrl, error: "Không tải được dữ liệu S&P 500" });
      });

    return () => {
      cancelled = true;
    };
  }, [benchUrl]);

  const benchReady = bench && bench.url === benchUrl ? bench : null;
  // Chờ giá lịch sử của các mã trong danh mục: không có nó thì giữa các lệnh vị thế bị
  // định giá theo giá khớp gần nhất và đường danh mục phẳng rồi vọt ở điểm cuối.
  const historyPending = historyStatus === "loading";

  const comparison = useMemo(() => {
    if (!benchReady || "error" in benchReady || !benchmarkWindow || historyPending) return null;
    return buildBenchmarkComparison(
      { ...portfolioInput, priceHistory: closes ?? undefined },
      benchReady.points,
      benchmarkWindow,
      range
    );
  }, [benchReady, benchmarkWindow, historyPending, portfolioInput, closes, range]);

  const loading = Boolean(benchUrl) && (!benchReady || historyPending);
  const error =
    benchReady && "error" in benchReady
      ? benchReady.error
      : benchReady && !loading && !comparison
        ? "Không tải được dữ liệu S&P 500 cho khoảng thời gian này"
        : null;

  // Đổi khung thời gian thì giữ biểu đồ cũ trong lúc tải, không nháy trống.
  if (comparison && comparison !== shown) setShown(comparison);
  const display = comparison ?? (loading ? shown : null);

  if (!hasData) {
    return (
      <div className="app-card">
        <h2 className="mb-2 font-semibold">So sánh với S&P 500</h2>
        <p className="text-sm text-gray-500">
          Cần ít nhất một lệnh mua/bán để so sánh benchmark
        </p>
      </div>
    );
  }

  return (
    <div className="app-card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">So sánh với S&P 500</h2>
          <p className="text-xs text-gray-500">
            S&P 500: 0% đầu kỳ · Danh mục: (Δ lãi chốt + Δ float) / cost mở · &quot;Tất cả&quot;: tích lũy
            {display?.clampedToHistory && (
              <> · Từ {formatDate(display.from)} (ngày trade đầu)</>
            )}
            {display && (
              <>
                {" "}
                · {formatDate(display.from)} – {formatDate(display.to)}
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
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                range === item.value ? "app-pill-active" : "app-pill-inactive"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !display && (
        <p className="text-sm text-gray-500">Đang tải dữ liệu S&P 500...</p>
      )}

      {error && !loading && !display && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {display && (
        <div className={loading ? "pointer-events-none opacity-60" : undefined}>
          {loading && (
            <p className="mb-2 text-xs text-gray-400">Đang cập nhật khoảng thời gian...</p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Danh mục"
              value={formatPercent(display.portfolioReturn)}
              trend={display.portfolioReturn >= 0 ? "up" : "down"}
              sub={
                display.holdingsCost > 0
                  ? `Cost mở: ${formatMoney(display.holdingsCost)}`
                  : display.realizedPnl !== 0
                    ? `Đã chốt: ${formatMoney(display.realizedPnl)}`
                    : undefined
              }
            />
            <StatCard
              label="S&P 500"
              value={formatPercent(display.sp500Return)}
              trend={display.sp500Return >= 0 ? "up" : "down"}
            />
            <StatCard
              label="Vượt / thua S&P 500"
              value={formatPercent(display.outperformance)}
              trend={display.outperformance >= 0 ? "up" : "down"}
              sub={
                display.outperformance >= 0
                  ? "Đánh bại thị trường"
                  : "Kém thị trường"
              }
            />
          </div>

          <div className="min-w-0 w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={display.points.map((p, i, all) => {
                  // Điểm đầu kỳ và điểm cuối tháng đầu cùng một tháng — chỉ ghi nhãn một lần.
                  const label = formatChartMonthYear(p.date);
                  const repeated = i > 0 && formatChartMonthYear(all[i - 1].date) === label;
                  return { ...p, label: repeated ? "" : label };
                })}
              >
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={{ stroke: chartTheme.grid }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v) => formatChartAxisPercent(Number(v))}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
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
                  stroke={chartTheme.accent}
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
        </div>
      )}
    </div>
  );
}
