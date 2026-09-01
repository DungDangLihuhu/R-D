"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { ChartStyle, ChartTimeframe, OhlcPoint } from "@/lib/chart-history";
import { FUNDAMENTAL_CHART_TIMEFRAMES, showPriceLevelsOnChart } from "@/lib/chart-history";
import { computeChartYDomain, formatChartPrice } from "@/lib/chart-domain";
import type { PriceLevels } from "@/lib/stock-analysis";
import { useChartHistory } from "@/hooks/useChartHistory";
import { useChartTheme } from "@/lib/chart-theme";

const CHART_COLORS = {
  price: "#0ea5e9",
  targetAnalyst: "#8b5cf6",
  targetFundamental: "#f59e0b",
  support: "#10b981",
  resistance: "#ef4444",
  candleUp: "#10b981",
  candleDown: "#ef4444",
} as const;

const TIMEFRAME_LABELS: Record<ChartTimeframe, string> = {
  "1h": "1H",
  "4h": "4H",
  "1d": "1D",
  "1w": "1W",
  "1m": "1M",
  all: "All",
};

function priceLevelExtras(levels?: PriceLevels): number[] {
  if (!levels) return [];
  const extras: number[] = [];
  if (levels.targetAnalyst) extras.push(levels.targetAnalyst.price);
  if (levels.targetFundamental) extras.push(levels.targetFundamental.price);
  for (const s of levels.support) extras.push(s.price);
  for (const r of levels.resistance) extras.push(r.price);
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
        const color = isUp ? CHART_COLORS.candleUp : CHART_COLORS.candleDown;
        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);
        if (yHigh == null || yLow == null || yOpen == null || yClose == null) return null;

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1);

        return (
          <g key={point.date}>
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

function ChartTooltip({
  active,
  payload,
  currency,
  chartStyle,
}: {
  active?: boolean;
  payload?: { payload?: OhlcPoint }[];
  currency: string;
  chartStyle: ChartStyle;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  if (chartStyle === "line") {
    return (
      <div className="rounded-lg border border-gray-200 bg-app-surface px-3 py-2 text-xs shadow-md">
        <p className="text-gray-500">{p.label}</p>
        <p className="font-semibold tabular-nums">{formatMoney(p.close, currency)}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-app-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-gray-500">{p.label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-gray-500">Mở</span>
        <span>{formatMoney(p.open, currency)}</span>
        <span className="text-gray-500">Cao</span>
        <span>{formatMoney(p.high, currency)}</span>
        <span className="text-gray-500">Thấp</span>
        <span>{formatMoney(p.low, currency)}</span>
        <span className="text-gray-500">Đóng</span>
        <span className="font-semibold">{formatMoney(p.close, currency)}</span>
      </div>
    </div>
  );
}

export function StockPriceChart({
  symbol,
  currency,
  priceLevels,
  dailySeed,
}: {
  symbol: string;
  currency: string;
  priceLevels?: PriceLevels;
  dailySeed?: { date: string; close: number }[];
}) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1d");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("line");
  const { points, loading, error } = useChartHistory(symbol, timeframe, dailySeed);
  const chartTheme = useChartTheme();

  const levels = showPriceLevelsOnChart(timeframe) ? priceLevels : undefined;

  const yDomain = useMemo(
    () => computeChartYDomain(points, { extras: priceLevelExtras(levels) }),
    [points, levels]
  );

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold">Phân tích cơ bản</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {FUNDAMENTAL_CHART_TIMEFRAMES.map((tf) => (
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
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => setChartStyle("line")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                chartStyle === "line"
                  ? "bg-gray-800 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Đường
            </button>
            <button
              type="button"
              onClick={() => setChartStyle("candle")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                chartStyle === "candle"
                  ? "bg-gray-800 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Nến
            </button>
          </div>
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

      {!loading && !error && points.length > 1 && (
        <>
          <div className="min-w-0 w-full h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} barCategoryGap="20%">
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: chartTheme.tick, fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickFormatter={(value) => {
                    const p = points.find((pt) => pt.date === value);
                    return p?.label ?? String(value).slice(0, 10);
                  }}
                />
                <YAxis
                  tick={{ fill: chartTheme.tick, fontSize: 10 }}
                  domain={yDomain}
                  width={64}
                  tickFormatter={formatChartPrice}
                  allowDecimals
                  tickCount={6}
                />
                <Tooltip
                  content={<ChartTooltip currency={currency} chartStyle={chartStyle} />}
                />
                {levels?.support.map((s) => (
                  <ReferenceLine
                    key={`s-${s.label}-${s.price}`}
                    y={s.price}
                    stroke={CHART_COLORS.support}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                  />
                ))}
                {levels?.resistance.map((r) => (
                  <ReferenceLine
                    key={`r-${r.label}-${r.price}`}
                    y={r.price}
                    stroke={CHART_COLORS.resistance}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                  />
                ))}
                {levels?.targetFundamental && (
                  <ReferenceLine
                    y={levels.targetFundamental.price}
                    stroke={CHART_COLORS.targetFundamental}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                  />
                )}
                {levels?.targetAnalyst && (
                  <ReferenceLine
                    y={levels.targetAnalyst.price}
                    stroke={CHART_COLORS.targetAnalyst}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                  />
                )}
                {chartStyle === "candle" ? (
                  <>
                    <Bar dataKey="close" fill="transparent" isAnimationActive={false} />
                    <Candlesticks data={points} />
                  </>
                ) : (
                  <Line
                    type="monotone"
                    dataKey="close"
                    stroke={CHART_COLORS.price}
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {levels && (
            <PriceLevelsSummary
              priceLevels={levels}
              currency={currency}
              chartStyle={chartStyle}
            />
          )}
        </>
      )}
    </div>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span
        className="inline-block h-0.5 w-4"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

function LevelCard({
  title,
  price,
  upside,
  method,
  currency,
  color,
}: {
  title: string;
  price: number;
  upside: number;
  method: string;
  currency: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: `${color}40`, background: `${color}10` }}
    >
      <p className="text-xs font-medium" style={{ color }}>
        {title}
      </p>
      <p className="text-sm font-semibold tabular-nums">{formatMoney(price, currency)}</p>
      <p
        className={`text-xs tabular-nums ${
          upside >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {upside >= 0 ? "+" : ""}
        {upside.toFixed(2)}% so với giá hiện tại
      </p>
      <p className="mt-0.5 text-[10px] text-gray-500">{method}</p>
    </div>
  );
}

function PriceLevelsSummary({
  priceLevels,
  currency,
  chartStyle,
}: {
  priceLevels: PriceLevels;
  currency: string;
  chartStyle: ChartStyle;
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <LegendDot
          color={chartStyle === "candle" ? CHART_COLORS.candleUp : CHART_COLORS.price}
          label={chartStyle === "candle" ? "Nến" : "Giá đóng cửa"}
        />
        {priceLevels.targetAnalyst && (
          <LegendDot color={CHART_COLORS.targetAnalyst} label="Giá mục tiêu (phân tích)" dashed />
        )}
        {priceLevels.targetFundamental && (
          <LegendDot color={CHART_COLORS.targetFundamental} label="Giá trị hợp lý (cơ bản)" dashed />
        )}
        {priceLevels.support.length > 0 && (
          <LegendDot color={CHART_COLORS.support} label="Hỗ trợ" dashed />
        )}
        {priceLevels.resistance.length > 0 && (
          <LegendDot color={CHART_COLORS.resistance} label="Kháng cự" dashed />
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {priceLevels.targetAnalyst && (
          <LevelCard
            title="Giá mục tiêu (phân tích)"
            price={priceLevels.targetAnalyst.price}
            upside={priceLevels.targetAnalyst.upsidePercent}
            method={priceLevels.targetAnalyst.method}
            currency={currency}
            color={CHART_COLORS.targetAnalyst}
          />
        )}
        {priceLevels.targetFundamental && (
          <LevelCard
            title="Giá trị hợp lý (cơ bản)"
            price={priceLevels.targetFundamental.price}
            upside={priceLevels.targetFundamental.upsidePercent}
            method={priceLevels.targetFundamental.method}
            currency={currency}
            color={CHART_COLORS.targetFundamental}
          />
        )}
        {priceLevels.support.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2"
          >
            <p className="text-xs font-medium text-emerald-800">{s.label}</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-900">
              {formatMoney(s.price, currency)}
            </p>
          </div>
        ))}
        {priceLevels.resistance.map((r) => (
          <div
            key={r.label}
            className="rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2"
          >
            <p className="text-xs font-medium text-rose-800">{r.label}</p>
            <p className="text-sm font-semibold tabular-nums text-rose-900">
              {formatMoney(r.price, currency)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
