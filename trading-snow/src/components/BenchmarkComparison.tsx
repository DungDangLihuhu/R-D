"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
  formatAxisMoney,
  formatChartMonthYear,
  formatDate,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { fetchJson } from "@/lib/fetch-cache";
import { useChartTheme } from "@/lib/chart-theme";
import type { PortfolioStats, Transaction } from "@/lib/types";
import type { ExDividend, HistoryPoint } from "@/lib/yahoo";

/** Mốc trục thời gian: phiên đầu mỗi tháng, thưa dần khi kỳ dài để còn khoảng 7 nhãn. */
function monthTicks(dates: string[]): string[] {
  const starts = dates.filter((d, i) => i === 0 || d.slice(0, 7) !== dates[i - 1].slice(0, 7));
  const step = Math.max(1, Math.ceil(starts.length / 7));
  return starts.filter((_, i) => i % step === 0);
}

function signedMoney(value: number): string {
  return `${value >= 0.005 ? "+" : ""}${formatMoney(value)}`;
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
  const cash = display?.sameCashFlows;
  const ticks = useMemo(() => (cash ? monthTicks(cash.points.map((p) => p.date)) : []), [cash]);
  // Lãi ÷ vốn bình quân trong kỳ; hai bên cùng dòng tiền nên cùng mẫu số.
  const pct = cash && cash.averageCapital > 0 ? (v: number) => (v / cash.averageCapital) * 100 : null;

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
            Cùng dòng tiền (cách Snowball so sánh): mỗi lệnh mua/bán trong kỳ là mua/bán{" "}
            {priceOnlyIndex ? "chỉ số S&P 500 (^GSPC, chỉ giá — không tải được SPY)" : "SPY"} cùng
            số tiền, cùng ngày · cổ tức trước thuế · giá phiên chính
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

      {display && !cash && !loading && (
        <p className="text-sm text-gray-500">
          Chưa tải được giá lịch sử của các mã trong danh mục nên chưa so sánh được.
        </p>
      )}

      {cash && (
        <div className={loading ? "pointer-events-none opacity-60" : undefined}>
          {loading && (
            <p className="mb-2 text-xs text-gray-400">Đang cập nhật khoảng thời gian...</p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Danh mục"
              value={pct ? formatPercent(pct(cash.profit)) : signedMoney(cash.profit)}
              trend={cash.profit >= 0 ? "up" : "down"}
              sub={`Lãi ${signedMoney(cash.profit)}`}
            />
            <StatCard
              label="Nếu mua SPY"
              value={pct ? formatPercent(pct(cash.benchmarkProfit)) : signedMoney(cash.benchmarkProfit)}
              trend={cash.benchmarkProfit >= 0 ? "up" : "down"}
              sub={`Lãi ${signedMoney(cash.benchmarkProfit)}`}
            />
            <StatCard
              label="Hơn / kém SPY"
              value={
                pct
                  ? formatPercent(pct(cash.profit - cash.benchmarkProfit))
                  : signedMoney(cash.profit - cash.benchmarkProfit)
              }
              trend={cash.profit >= cash.benchmarkProfit ? "up" : "down"}
              sub={`${cash.profit >= cash.benchmarkProfit ? "Hơn" : "Kém"} ${formatMoney(
                Math.abs(cash.profit - cash.benchmarkProfit)
              )}`}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {pct
              ? `% = lãi ÷ vốn bình quân trong kỳ (${formatMoney(cash.averageCapital)}), tức lợi nhuận theo dòng tiền (Modified Dietz), chưa quy ra năm.`
              : "Trong kỳ bán ra nhiều hơn vốn bỏ vào nên không tính được %, chỉ so số tiền lãi."}
          </p>

          <div className="mt-3 min-w-0 w-full">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cash.points}>
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
                  width={56}
                  tickFormatter={(v) => formatAxisMoney(Number(v))}
                  domain={["auto", "auto"]}
                />
                <ReferenceLine y={0} stroke={chartTheme.tick} strokeOpacity={0.4} />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  formatter={(v, name) => [
                    v == null ? "—" : `Lãi ${signedMoney(Number(v))}`,
                    name === "portfolio" ? "Danh mục" : "Nếu mua SPY",
                  ]}
                  labelFormatter={(date) => (date ? formatDate(String(date)) : "")}
                />
                <Legend
                  formatter={(value) => (value === "portfolio" ? "Danh mục" : "Nếu mua SPY")}
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke={chartTheme.accent}
                  strokeWidth={2}
                  dot={false}
                  name="portfolio"
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
