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
  benchmarkLevels,
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
  formatDecimal,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { fetchJson } from "@/lib/fetch-cache";
import { useChartTheme } from "@/lib/chart-theme";
import type { PortfolioStats, Transaction } from "@/lib/types";
import type { ExDividend, HistoryPoint } from "@/lib/yahoo";

function formatChartAxisPercent(value: number): string {
  const pct = value - 100;
  if (pct === 0) return "0%";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

/** Mốc trục thời gian: phiên đầu mỗi tháng, thưa dần khi kỳ dài để còn khoảng 7 nhãn. */
function monthTicks(dates: string[]): string[] {
  const starts = dates.filter((d, i) => i === 0 || d.slice(0, 7) !== dates[i - 1].slice(0, 7));
  const step = Math.max(1, Math.ceil(starts.length / 7));
  return starts.filter((_, i) => i % step === 0);
}

function signedMoney(value: number): string {
  return `${value >= 0.005 ? "+" : ""}${formatMoney(value)}`;
}

function formatIndexedReturn(value: number): string {
  const pct = value - 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${formatDecimal(Math.abs(pct), 2)}%`;
}

export function BenchmarkComparison({
  equityCurve,
  transactions,
  nativeTransactions,
  marketPrices,
}: {
  equityCurve: PortfolioStats["equityCurve"];
  /** Lệnh đã quy ra USD. */
  transactions: Transaction[];
  /** Cùng các lệnh đó theo tiền niêm yết — để chọn đúng kiểu giá lịch sử. */
  nativeTransactions: Transaction[];
  /** Giá hiện tại đã quy ra USD. */
  marketPrices: Record<string, number>;
}) {
  const [range, setRange] = useState<BenchmarkRange>("all");
  const [bench, setBench] = useState<
    | { url: string; points: HistoryPoint[]; dividends?: ExDividend[]; symbol?: string }
    | { url: string; error: string }
    | null
  >(null);
  const [shown, setShown] = useState<ComparisonResult | null>(null);
  const chartTheme = useChartTheme();
  const { series: closes, status: historyStatus } = usePriceHistory(nativeTransactions);

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
    ? // `tr=2`: bản kèm cổ tức SPY — khác URL để không dùng lại phản hồi cũ trong cache.
      `/api/benchmark?from=${extendBenchmarkFrom(benchmarkWindow.from)}&to=${benchmarkWindow.to}&tr=2`
    : "";

  useEffect(() => {
    if (!benchUrl) return;
    let cancelled = false;

    // 5 phút như giá danh mục: điểm cuối hai bên cùng thời điểm.
    fetchJson<{
      points?: HistoryPoint[];
      dividends?: ExDividend[];
      symbol?: string;
      error?: string;
    }>(benchUrl, {
      ttlMs: 5 * 60 * 1000,
    })
      .then((data) => {
        if (cancelled) return;
        setBench(
          data.error
            ? { url: benchUrl, error: data.error }
            : {
                url: benchUrl,
                points: data.points ?? [],
                dividends: data.dividends,
                symbol: data.symbol,
              }
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
  const benchSeries = useMemo(
    () =>
      benchReady && !("error" in benchReady)
        ? benchmarkLevels(benchReady.points, benchReady.dividends)
        : null,
    [benchReady]
  );
  // Chờ giá lịch sử của các mã trong danh mục: không có nó thì giữa các lệnh vị thế bị
  // định giá theo giá khớp gần nhất và đường danh mục phẳng rồi vọt ở điểm cuối.
  const historyPending = historyStatus === "loading";

  const comparison = useMemo(() => {
    if (!benchSeries || !benchmarkWindow || historyPending) return null;
    return buildBenchmarkComparison(
      { ...portfolioInput, priceHistory: closes ?? undefined },
      benchSeries,
      benchmarkWindow,
      range
    );
  }, [benchSeries, benchmarkWindow, historyPending, portfolioInput, closes, range]);

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
  const priceOnlyIndex =
    benchReady && "symbol" in benchReady && benchReady.symbol != null && benchReady.symbol !== "SPY";
  const ticks = useMemo(() => (display ? monthTicks(display.points.map((p) => p.date)) : []), [display]);

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
            {display?.method === "cost"
              ? "S&P 500: 0% đầu kỳ · Danh mục: (Δ lãi chốt + Δ float) / cost mở (chưa tải được giá lịch sử)"
              : "Lợi nhuận theo thời gian của phần cổ phiếu: mua là tiền vào, bán và cổ tức là tiền ra · cổ tức hai bên tính trước thuế · giá phiên chính"}
            {display && (
              <>
                {" "}
                · từ giá đóng cửa {formatDate(display.from)} tới {formatDate(display.to)}
              </>
            )}
            {display?.clampedToHistory && <> (danh mục bắt đầu sau đầu kỳ)</>}
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
                display.method === "twr"
                  ? "Theo thời gian (TWR)"
                  : display.holdingsCost > 0
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
              sub={
                priceOnlyIndex
                  ? "^GSPC, chỉ giá (không tải được SPY)"
                  : "SPY, gồm cổ tức trước thuế"
              }
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

          {display.sameCashFlows && (
            <div className="mt-3 rounded-lg border border-app-border px-4 py-3">
              <p className="text-xs text-app-muted">
                Cùng dòng tiền (cách Snowball so sánh): nếu mỗi lệnh mua/bán trong kỳ là mua/bán
                SPY cùng số tiền, cùng ngày
              </p>
              <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
                <span className="text-app-muted">
                  Lãi danh mục{" "}
                  <strong className="text-app-text">{signedMoney(display.sameCashFlows.profit)}</strong>
                </span>
                <span className="text-app-muted">
                  Nếu mua SPY{" "}
                  <strong className="text-app-text">
                    {signedMoney(display.sameCashFlows.benchmarkProfit)}
                  </strong>
                </span>
                <span className="text-app-muted">
                  Chênh lệch{" "}
                  <strong
                    className={
                      display.sameCashFlows.profit >= display.sameCashFlows.benchmarkProfit
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }
                  >
                    {signedMoney(
                      display.sameCashFlows.profit - display.sameCashFlows.benchmarkProfit
                    )}
                  </strong>
                </span>
              </div>
            </div>
          )}

          <div className="mt-3 min-w-0 w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={display.points}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  interval={0}
                  tickFormatter={(d) => formatChartMonthYear(String(d))}
                  tick={{ fill: chartTheme.tick, fontSize: 11 }}
                  axisLine={{ stroke: chartTheme.grid }}
                  tickLine={false}
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
                  labelFormatter={(date) => (date ? formatDate(String(date)) : "")}
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
