"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { formatMoney, formatPercent, formatVolume } from "@/lib/format";
import type { ChartTimeframe, OhlcPoint } from "@/lib/chart-history";
import { TECHNICAL_CHART_TIMEFRAMES } from "@/lib/chart-history";
import { computeChartYDomain, formatChartPrice } from "@/lib/chart-domain";
import { useChartHistory } from "@/hooks/useChartHistory";
import { useChartTheme } from "@/lib/chart-theme";
import {
  computeBenDangIndicators,
  type BenDangIndicators,
  type BenDangLayers,
  type SrLevel,
  type WyckoffResult,
} from "@/lib/indicators/ben-dang";
import { computeRsiSeries } from "@/lib/indicators/ben-dang/utils";

const COLORS = {
  candleUp: "#10b981",
  candleDown: "#ef4444",
  premium: "rgba(239, 68, 68, 0.24)",
  premiumBorder: "rgba(239, 68, 68, 0.45)",
  discount: "rgba(16, 185, 129, 0.24)",
  discountBorder: "rgba(16, 185, 129, 0.45)",
  equilibrium: "#8b5cf6",
  support: "#10b981",
  resistance: "#ef4444",
  creek: "#f59e0b",
  ice: "#06b6d4",
  entry: "#38bdf8",
  rsi: "#a78bfa",
} as const;

type TaPoint = OhlcPoint & { rsi: number | null };

const TA_SYNC_ID = "ta-ohlcv-rsi";
const CHART_MARGIN = { top: 6, right: 12, left: 0, bottom: 2 };
const Y_AXIS_WIDTH = 64;
const RSI_PERIOD = 14;

const TIMEFRAME_LABELS: Record<ChartTimeframe, string> = {
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  all: "All",
};

const DEFAULT_LAYERS: BenDangLayers = {
  smc: true,
  sr: true,
  wyckoff: true,
};

function indicatorExtras(indicators: BenDangIndicators): number[] {
  const extras: number[] = [];
  for (const l of indicators.sr.levels) extras.push(l.price);
  if (indicators.smc.premiumDiscount) {
    extras.push(
      indicators.smc.premiumDiscount.top,
      indicators.smc.premiumDiscount.bottom,
      indicators.smc.premiumDiscount.equilibrium
    );
  }
  const w = indicators.wyckoff;
  if (w.tradingRange) {
    extras.push(w.tradingRange.top, w.tradingRange.bottom);
  }
  if (w.entry) extras.push(w.entry.price);
  return extras;
}

function Candlesticks({ data }: { data: OhlcPoint[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();

  if (!xScale || !yScale || !data.length) return null;

  const bodyWidth = Math.max(((plotArea?.width ?? 300) / data.length) * 0.65, 2);

  return (
    <g className="recharts-candlesticks">
      {data.map((point) => {
        const xCenter = xScale(point.date, { position: "middle" });
        if (xCenter == null) return null;

        const { open, high, low, close } = point;
        const isUp = close >= open;
        const color = isUp ? COLORS.candleUp : COLORS.candleDown;
        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);
        if (yHigh == null || yLow == null || yOpen == null || yClose == null) return null;

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

        return (
          <g key={`${point.date}-${point.label}`}>
            <line x1={xCenter} y1={yHigh} x2={xCenter} y2={yLow} stroke={color} strokeWidth={1} />
            <rect
              x={xCenter - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              fill={color}
              stroke={color}
              strokeWidth={1}
            />
          </g>
        );
      })}
    </g>
  );
}

function PremiumDiscountZones({
  zone,
  visible,
}: {
  zone?: BenDangIndicators["smc"]["premiumDiscount"];
  visible: boolean;
}) {
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();

  if (!visible || !zone || !yScale || !plotArea) return null;

  const yTop = yScale(zone.top);
  const yBot = yScale(zone.bottom);
  const yEq = yScale(zone.equilibrium);
  if (yTop == null || yBot == null || yEq == null) return null;

  const x = plotArea.x;
  const width = plotArea.width;
  const premiumY = Math.min(yTop, yEq);
  const premiumH = Math.max(Math.abs(yEq - yTop), 2);
  const discountY = Math.min(yEq, yBot);
  const discountH = Math.max(Math.abs(yBot - yEq), 2);

  return (
    <g className="premium-discount-zones">
      <rect
        x={x}
        y={premiumY}
        width={width}
        height={premiumH}
        fill={COLORS.premium}
        stroke={COLORS.premiumBorder}
        strokeWidth={1}
      />
      <rect
        x={x}
        y={discountY}
        width={width}
        height={discountH}
        fill={COLORS.discount}
        stroke={COLORS.discountBorder}
        strokeWidth={1}
      />
      <line
        x1={x}
        y1={yEq}
        x2={x + width}
        y2={yEq}
        stroke={COLORS.equilibrium}
        strokeDasharray="5 4"
        strokeWidth={1.5}
      />
      <text x={x + 8} y={premiumY + 14} fontSize={10} fill="#b91c1c" fontWeight={700}>
        Premium
      </text>
      <text
        x={x + 8}
        y={discountY + discountH - 6}
        fontSize={10}
        fill="#047857"
        fontWeight={700}
      >
        Discount
      </text>
    </g>
  );
}

function SrLines({
  levels,
  visible,
}: {
  levels: SrLevel[];
  visible: boolean;
}) {
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();

  if (!visible || !yScale || !plotArea) return null;

  const yAt = (price: number) => yScale(price);

  return (
    <g className="sr-lines">
      {levels.map((level, i) => {
        const y = yAt(level.price);
        if (y == null) return null;
        const color = level.type === "support" ? COLORS.support : COLORS.resistance;
        return (
          <g key={`sr-${i}`}>
            <line
              x1={plotArea.x}
              y1={y}
              x2={plotArea.x + plotArea.width}
              y2={y}
              stroke={color}
              strokeWidth={1.5 + level.strength}
              strokeDasharray="8 4"
              opacity={0.85}
            />
            <text
              x={plotArea.x + plotArea.width - 4}
              y={y - 4}
              textAnchor="end"
              fontSize={10}
              fill={color}
              fontWeight={600}
            >
              {level.type === "support" ? "S" : "R"} {formatChartPrice(level.price)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function WyckoffLines({
  wyckoff,
  visible,
}: {
  wyckoff: WyckoffResult;
  visible: boolean;
}) {
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();

  if (!visible || !yScale || !plotArea) return null;

  const lines: { price: number; color: string; label: string; dashed?: boolean }[] = [];
  const ice = wyckoff.tradingRange?.ice;
  const creek = wyckoff.tradingRange?.creek;
  const entryPx = wyckoff.entry?.price;
  const same = (a?: number, b?: number) =>
    a != null && b != null && Math.abs(a - b) / Math.max(Math.abs(a), 1) < 0.004;

  if (creek != null) {
    lines.push({ price: creek, color: COLORS.creek, label: "Creek", dashed: true });
  }
  if (ice != null) {
    const iceLabel = same(ice, entryPx) ? "Ice / Vào" : "Ice";
    lines.push({
      price: ice,
      color: same(ice, entryPx) ? COLORS.entry : COLORS.ice,
      label: iceLabel,
      dashed: !same(ice, entryPx),
    });
  }
  if (entryPx != null && !same(entryPx, ice) && !same(entryPx, creek)) {
    lines.push({ price: entryPx, color: COLORS.entry, label: "Vào", dashed: false });
  }
  if (!lines.length) return null;

  const labelOffset = new Map<number, number>();
  return (
    <g className="wyckoff-lines">
      {lines.map((line, i) => {
        const y = yScale(line.price);
        if (y == null) return null;
        const roundedY = Math.round(y);
        const stack = labelOffset.get(roundedY) ?? 0;
        labelOffset.set(roundedY, stack + 1);
        return (
          <g key={`wk-${line.label}-${i}`}>
            <line
              x1={plotArea.x}
              y1={y}
              x2={plotArea.x + plotArea.width}
              y2={y}
              stroke={line.color}
              strokeWidth={line.dashed ? 1.4 : 2}
              strokeDasharray={line.dashed ? "6 4" : undefined}
              opacity={0.9}
            />
            <text
              x={plotArea.x + 8}
              y={y - 4 - stack * 12}
              fontSize={10}
              fill={line.color}
              fontWeight={700}
            >
              {line.label} {formatChartPrice(line.price)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  currency,
  tooltipStyle,
}: {
  active?: boolean;
  payload?: { payload?: TaPoint }[];
  currency: string;
  tooltipStyle?: CSSProperties;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={tooltipStyle}
    >
      <p className="mb-1 opacity-70">{p.label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="opacity-70">Mở</span>
        <span>{formatMoney(p.open, currency)}</span>
        <span className="opacity-70">Cao</span>
        <span>{formatMoney(p.high, currency)}</span>
        <span className="opacity-70">Thấp</span>
        <span>{formatMoney(p.low, currency)}</span>
        <span className="opacity-70">Đóng</span>
        <span className="font-semibold">{formatMoney(p.close, currency)}</span>
        <span className="opacity-70">Vol</span>
        <span>{formatVolume(p.volume)}</span>
        <span className="opacity-70">RSI {RSI_PERIOD}</span>
        <span className="font-semibold">
          {p.rsi != null ? p.rsi.toFixed(1) : "—"}
        </span>
      </div>
    </div>
  );
}

function VolumeBarShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: TaPoint;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || height <= 0) return null;
  const up = payload.close >= payload.open;
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      fill={up ? COLORS.candleUp : COLORS.candleDown}
      opacity={0.72}
    />
  );
}

function PaneLabel({
  title,
  value,
  valueClass,
}: {
  title: string;
  value?: string;
  valueClass?: string;
}) {
  return (
    <div className="pointer-events-none absolute left-[72px] top-1 z-10 flex items-baseline gap-2 text-[11px] font-medium text-gray-500">
      <span>{title}</span>
      {value ? <span className={`tabular-nums font-semibold ${valueClass ?? ""}`}>{value}</span> : null}
    </div>
  );
}

function SrLevelsPanel({
  levels,
  currency,
  currentPrice,
}: {
  levels: SrLevel[];
  currency: string;
  currentPrice: number;
}) {
  const supports = levels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price);
  const resistances = levels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price);

  if (!supports.length && !resistances.length) {
    return (
      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500">Chưa đủ dữ liệu để xác định hỗ trợ/kháng cự.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
      <h4 className="text-sm font-semibold">Mức hỗ trợ &amp; kháng cự</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {resistances.map((level, i) => {
          const dist = ((level.price - currentPrice) / currentPrice) * 100;
          return (
            <div
              key={`r-${level.price}-${i}`}
              className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2"
            >
              <p className="text-xs font-medium text-rose-800">
                Kháng cự {resistances.length > 1 ? `#${i + 1}` : ""}
              </p>
              <p className="text-sm font-semibold tabular-nums text-rose-900">
                {formatMoney(level.price, currency)}
              </p>
              <p className="text-xs tabular-nums text-rose-700">
                {dist >= 0 ? "+" : ""}
                {dist.toFixed(2)}% so với giá hiện tại
              </p>
            </div>
          );
        })}
        {supports.map((level, i) => {
          const dist = ((level.price - currentPrice) / currentPrice) * 100;
          return (
            <div
              key={`s-${level.price}-${i}`}
              className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2"
            >
              <p className="text-xs font-medium text-emerald-800">
                Hỗ trợ {supports.length > 1 ? `#${i + 1}` : ""}
              </p>
              <p className="text-sm font-semibold tabular-nums text-emerald-900">
                {formatMoney(level.price, currency)}
              </p>
              <p className="text-xs tabular-nums text-emerald-700">
                {dist >= 0 ? "+" : ""}
                {dist.toFixed(2)}% so với giá hiện tại
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WyckoffPanel({
  indicators,
  currency,
  currentPrice,
}: {
  indicators: BenDangIndicators;
  currency: string;
  currentPrice: number;
}) {
  const w = indicators.wyckoff;
  const phaseColors: Record<string, string> = {
    accumulation: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800",
    markup: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800",
    distribution: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
    markdown: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800",
    unknown: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  };
  const entry = w.entry;
  const distPct =
    entry && currentPrice > 0 ? ((entry.price - currentPrice) / currentPrice) * 100 : null;
  const actionLabel =
    entry?.action === "buy" ? "Gần mốc — có thể vào" : entry?.action === "avoid" ? "Không vào long" : "Chờ giá về mốc";
  const actionClass =
    entry?.action === "buy"
      ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/40"
      : entry?.action === "avoid"
        ? "border-rose-300 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/40"
        : "border-sky-300 bg-sky-50/80 dark:border-sky-800 dark:bg-sky-950/40";

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Wyckoff</p>
          <p
            className={`mt-1 inline-block rounded-lg border px-3 py-1.5 text-sm font-semibold ${
              phaseColors[w.phase] ?? phaseColors.unknown
            }`}
          >
            {w.phaseLabel}
          </p>
        </div>
        {w.tradingRange && (
          <div className="text-right text-xs text-gray-600 dark:text-slate-300">
            <p>
              Ice {formatMoney(w.tradingRange.ice, currency)} – Creek{" "}
              {formatMoney(w.tradingRange.creek, currency)}
            </p>
          </div>
        )}
      </div>

      {entry && (
        <div className={`rounded-lg border px-3 py-2.5 ${actionClass}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Giá nên vào
              </p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(entry.price, currency)}</p>
              <p className="text-xs font-medium">{entry.label}</p>
            </div>
            <div className="text-right text-xs">
              <p className="font-medium">{actionLabel}</p>
              {distPct != null && (
                <p className="tabular-nums text-gray-600 dark:text-slate-300">
                  {formatPercent(distPct)} so với giá hiện tại
                </p>
              )}
              {entry.stop != null && entry.stop > 0 && (
                <p className="mt-0.5 tabular-nums text-gray-500">
                  Cắt lỗ {formatMoney(entry.stop, currency)}
                </p>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-600 dark:text-slate-300">{entry.reason}</p>
        </div>
      )}

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800/80">
          <dt className="text-xs text-gray-500">Xu hướng</dt>
          <dd className="font-medium">{w.summary.trend}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800/80">
          <dt className="text-xs text-gray-500">Volume</dt>
          <dd className="font-medium">{w.summary.volumePattern}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800/80">
          <dt className="text-xs text-gray-500">Gợi ý</dt>
          <dd className="font-medium">{w.summary.recommendation}</dd>
        </div>
      </dl>

      {w.events.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {w.events.map((e) => (
            <span
              key={`${e.event}-${e.index}`}
              title={e.label}
              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              {e.event}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LayerToggle({
  layers,
  onChange,
}: {
  layers: BenDangLayers;
  onChange: (next: BenDangLayers) => void;
}) {
  const items: { key: keyof BenDangLayers; label: string }[] = [
    { key: "smc", label: "P/D" },
    { key: "sr", label: "S/R" },
    { key: "wyckoff", label: "Wyckoff" },
  ];

  return (
    <div className="flex rounded-lg border border-gray-200 p-0.5">
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange({ ...layers, [key]: !layers[key] })}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            layers[key]
              ? "bg-sky-600 text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function BenDangChart({
  symbol,
  currency,
  dailySeed,
}: {
  symbol: string;
  currency: string;
  dailySeed?: { date: string; close: number }[];
}) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1d");
  const [layers, setLayers] = useState<BenDangLayers>(DEFAULT_LAYERS);
  const { points, loading, error } = useChartHistory(symbol, timeframe, dailySeed);
  const chartTheme = useChartTheme();

  const indicators = useMemo(
    () => (points.length > 5 ? computeBenDangIndicators(points) : null),
    [points]
  );

  const currentPrice = points.length ? points[points.length - 1].close : 0;

  const chartData = useMemo<TaPoint[]>(() => {
    const rsi = computeRsiSeries(
      points.map((p) => p.close),
      RSI_PERIOD
    );
    return points.map((p, i) => ({ ...p, rsi: rsi[i] }));
  }, [points]);

  const lastRsi = useMemo(() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (chartData[i].rsi != null) return chartData[i].rsi;
    }
    return null;
  }, [chartData]);

  const maxVolume = useMemo(
    () => chartData.reduce((m, p) => (p.volume > m ? p.volume : m), 0),
    [chartData]
  );

  const tooltipStyle = useMemo<CSSProperties>(
    () => ({
      background: chartTheme.tooltip.background,
      border: chartTheme.tooltip.border,
      color: chartTheme.tooltip.color,
      borderRadius: chartTheme.tooltip.borderRadius,
      boxShadow: chartTheme.tooltip.boxShadow,
    }),
    [chartTheme]
  );

  const rsiTone =
    lastRsi == null
      ? "text-gray-500"
      : lastRsi >= 70
        ? "text-rose-500"
        : lastRsi <= 30
          ? "text-emerald-500"
          : "text-violet-400";

  const yDomain = useMemo(
    () =>
      indicators
        ? computeChartYDomain(points, { extras: indicatorExtras(indicators) })
        : computeChartYDomain(points),
    [points, indicators]
  );

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Phân tích kĩ thuật</h3>
          <p className="text-xs text-gray-500">Premium/Discount · Hỗ trợ/Kháng cự · Wyckoff · Volume · RSI</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {TECHNICAL_CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? "bg-sky-600 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>
          <LayerToggle layers={layers} onChange={setLayers} />
        </div>
      </div>

      {loading && (
        <p className="py-16 text-center text-sm text-gray-500">Đang tải biểu đồ…</p>
      )}

      {error && !loading && (
        <p className="py-16 text-center text-sm text-rose-600">{error}</p>
      )}

      {!loading && !error && points.length < 2 && (
        <p className="py-16 text-center text-sm text-gray-500">Không đủ dữ liệu biểu đồ</p>
      )}

      {!loading && !error && points.length > 1 && indicators && (
        <>
          <div className="min-w-0 w-full space-y-1">
            <div className="relative h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  barCategoryGap="20%"
                  syncId={TA_SYNC_ID}
                  margin={CHART_MARGIN}
                >
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 10 }}
                    domain={yDomain}
                    width={Y_AXIS_WIDTH}
                    tickFormatter={formatChartPrice}
                    allowDecimals
                    tickCount={6}
                  />
                  <Tooltip
                    content={<ChartTooltip currency={currency} tooltipStyle={tooltipStyle} />}
                    cursor={{ stroke: chartTheme.tick, strokeDasharray: "3 3" }}
                  />
                  <Bar dataKey="close" fill="transparent" isAnimationActive={false} />
                  <PremiumDiscountZones
                    zone={indicators.smc.premiumDiscount}
                    visible={layers.smc}
                  />
                  <Candlesticks data={chartData} />
                  <SrLines levels={indicators.sr.levels} visible={layers.sr} />
                  <WyckoffLines wyckoff={indicators.wyckoff} visible={layers.wyckoff} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="relative h-[88px] w-full">
              <PaneLabel
                title="Vol"
                value={maxVolume > 0 ? formatVolume(chartData[chartData.length - 1]?.volume ?? 0) : "Không có dữ liệu"}
              />
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} syncId={TA_SYNC_ID} margin={CHART_MARGIN}>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 9 }}
                    width={Y_AXIS_WIDTH}
                    domain={[0, maxVolume > 0 ? maxVolume * 1.15 : 1]}
                    tickFormatter={formatVolume}
                    tickCount={3}
                    allowDecimals
                  />
                  <Tooltip
                    content={<ChartTooltip currency={currency} tooltipStyle={tooltipStyle} />}
                    cursor={{ stroke: chartTheme.tick, strokeDasharray: "3 3" }}
                  />
                  <Bar
                    dataKey="volume"
                    isAnimationActive={false}
                    shape={VolumeBarShape}
                    maxBarSize={18}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="relative h-[116px] w-full">
              <PaneLabel
                title={`RSI ${RSI_PERIOD}`}
                value={lastRsi != null ? lastRsi.toFixed(1) : "—"}
                valueClass={rsiTone}
              />
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} syncId={TA_SYNC_ID} margin={{ ...CHART_MARGIN, bottom: 18 }}>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: chartTheme.tick, fontSize: 10 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tickFormatter={(value) => {
                      const p = chartData.find((pt) => pt.date === value);
                      return p?.label ?? String(value).slice(0, 10);
                    }}
                  />
                  <YAxis
                    tick={{ fill: chartTheme.tick, fontSize: 9 }}
                    width={Y_AXIS_WIDTH}
                    domain={[0, 100]}
                    ticks={[30, 50, 70]}
                  />
                  <ReferenceArea y1={70} y2={100} fill="#ef4444" fillOpacity={0.08} ifOverflow="hidden" />
                  <ReferenceArea y1={0} y2={30} fill="#10b981" fillOpacity={0.08} ifOverflow="hidden" />
                  <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.7} />
                  <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.7} />
                  <ReferenceLine y={50} stroke={chartTheme.tick} strokeDasharray="3 3" strokeOpacity={0.45} />
                  <Tooltip
                    content={<ChartTooltip currency={currency} tooltipStyle={tooltipStyle} />}
                    cursor={{ stroke: chartTheme.tick, strokeDasharray: "3 3" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rsi"
                    stroke={COLORS.rsi}
                    strokeWidth={1.6}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {layers.sr && (
            <SrLevelsPanel
              levels={indicators.sr.levels}
              currency={currency}
              currentPrice={currentPrice}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
            {layers.smc && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-rose-200" /> Premium
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-emerald-200" /> Discount
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-0.5 w-3"
                    style={{ borderTop: "1px dashed #8b5cf6" }}
                  />{" "}
                  Equilibrium
                </span>
              </>
            )}
            {layers.sr && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-emerald-500" style={{ borderTop: "1px dashed" }} /> Hỗ trợ
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-rose-500" style={{ borderTop: "1px dashed" }} /> Kháng cự
                </span>
              </>
            )}
            {layers.wyckoff && (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3" style={{ borderTop: "1.5px dashed #06b6d4" }} /> Ice
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3" style={{ borderTop: "1.5px dashed #f59e0b" }} /> Creek
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-0.5 w-3 bg-sky-400" /> Giá vào
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
              <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" /> Volume
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-violet-400" /> RSI 14
            </span>
          </div>

          {layers.wyckoff && (
            <WyckoffPanel
              indicators={indicators}
              currency={currency}
              currentPrice={currentPrice}
            />
          )}
        </>
      )}
    </div>
  );
}
