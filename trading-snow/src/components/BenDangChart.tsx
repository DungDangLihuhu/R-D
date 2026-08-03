"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { ChartTimeframe, OhlcPoint } from "@/lib/chart-history";
import { CHART_TIMEFRAMES } from "@/lib/chart-history";
import { computeChartYDomain, formatChartPrice } from "@/lib/chart-domain";
import {
  computeBenDangIndicators,
  type BenDangIndicators,
  type BenDangLayers,
  type SrLevel,
} from "@/lib/indicators/ben-dang";

const GRID = "#e2e5ea";
const TICK = "#6b7280";

const COLORS = {
  candleUp: "#10b981",
  candleDown: "#ef4444",
  bos: "#3b82f6",
  choch: "#f59e0b",
  bullishOb: "rgba(16, 185, 129, 0.25)",
  bearishOb: "rgba(239, 68, 68, 0.25)",
  bullishFvg: "rgba(16, 185, 129, 0.15)",
  bearishFvg: "rgba(239, 68, 68, 0.15)",
  premium: "rgba(139, 92, 246, 0.12)",
  equilibrium: "#8b5cf6",
  support: "#10b981",
  resistance: "#ef4444",
  wyckoffRange: "rgba(59, 130, 246, 0.08)",
  wyckoffEvent: "#6366f1",
} as const;

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

function IndicatorOverlays({
  data,
  indicators,
  layers,
}: {
  data: OhlcPoint[];
  indicators: BenDangIndicators;
  layers: BenDangLayers;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plotArea = usePlotArea();

  if (!xScale || !yScale || !data.length) return null;

  const dateAt = (index: number) => data[index]?.date;
  const xAt = (index: number) => {
    const d = dateAt(index);
    return d != null ? xScale(d, { position: "middle" }) : null;
  };
  const yAt = (price: number) => yScale(price);

  const lastX = plotArea ? plotArea.x + plotArea.width : 0;

  const plotRight = plotArea ? plotArea.x + plotArea.width : lastX;

  return (
    <g className="ben-dang-overlays">
      {layers.smc && indicators.smc.premiumDiscount && (
        <g>
          {(() => {
            const z = indicators.smc.premiumDiscount!;
            const x1 = xAt(z.swingLowIndex) ?? plotArea?.x ?? 0;
            const yTop = yAt(z.top);
            const yBot = yAt(z.bottom);
            const yEq = yAt(z.equilibrium);
            if (yTop == null || yBot == null) return null;
            const rectY = Math.min(yTop, yBot);
            const rectH = Math.abs(yBot - yTop);
            const rectW = Math.max(plotRight - x1, 0);
            return (
              <>
                <rect
                  x={x1}
                  y={rectY}
                  width={rectW}
                  height={rectH}
                  fill={COLORS.premium}
                  stroke="none"
                />
                {yEq != null && (
                  <line
                    x1={x1}
                    y1={yEq}
                    x2={plotRight}
                    y2={yEq}
                    stroke={COLORS.equilibrium}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                )}
              </>
            );
          })()}
        </g>
      )}

      {layers.smc &&
        indicators.smc.fairValueGaps.map((fvg, i) => {
          const x1 = xAt(fvg.startIndex);
          const x2 = xAt(fvg.endIndex) ?? lastX;
          const yTop = yAt(fvg.top);
          const yBot = yAt(fvg.bottom);
          if (x1 == null || yTop == null || yBot == null) return null;
          return (
            <rect
              key={`fvg-${i}`}
              x={x1}
              y={Math.min(yTop, yBot)}
              width={Math.max((x2 ?? x1) - x1, 4)}
              height={Math.abs(yBot - yTop)}
              fill={fvg.type === "bullish" ? COLORS.bullishFvg : COLORS.bearishFvg}
              stroke={fvg.type === "bullish" ? COLORS.candleUp : COLORS.candleDown}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
          );
        })}

      {layers.smc &&
        indicators.smc.orderBlocks.map((ob, i) => {
          const x1 = xAt(ob.startIndex);
          const x2 = xAt(ob.extendIndex) ?? plotRight;
          const yTop = yAt(ob.high);
          const yBot = yAt(ob.low);
          if (x1 == null || yTop == null || yBot == null) return null;
          return (
            <rect
              key={`ob-${i}`}
              x={x1}
              y={Math.min(yTop, yBot)}
              width={Math.max(x2 - x1, 6)}
              height={Math.abs(yBot - yTop)}
              fill={ob.type === "bullish" ? COLORS.bullishOb : COLORS.bearishOb}
              stroke={ob.type === "bullish" ? COLORS.candleUp : COLORS.candleDown}
              strokeWidth={1}
            />
          );
        })}

      {layers.smc &&
        indicators.smc.structureLines.map((line, i) => {
          const x1 = xAt(line.fromIndex);
          const x2 = xAt(line.toIndex);
          const y = yAt(line.price);
          if (x1 == null || x2 == null || y == null) return null;
          const isInternal = line.scope === "internal";
          const color = line.type === "bos" ? COLORS.bos : COLORS.choch;
          return (
            <g key={`struct-${i}`} opacity={isInternal ? 0.55 : 1}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={color}
                strokeWidth={isInternal ? 1 : 1.5}
                strokeDasharray={line.type === "choch" || isInternal ? "6 3" : undefined}
              />
              {!isInternal && (
                <text
                  x={(x1 + x2) / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={color}
                  fontWeight={600}
                >
                  {line.type === "bos" ? "BOS" : "CHoCH"}
                </text>
              )}
            </g>
          );
        })}

      {layers.smc &&
        indicators.smc.equalLevels.map((eq, i) => {
          const x1 = xAt(eq.index1);
          const x2 = xAt(eq.index2);
          const y = yAt(eq.price);
          if (x1 == null || x2 == null || y == null) return null;
          return (
            <g key={`eq-${i}`}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={eq.type === "eqh" ? COLORS.resistance : COLORS.support}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" fontSize={8} fill={TICK}>
                {eq.type === "eqh" ? "EQH" : "EQL"}
              </text>
            </g>
          );
        })}

      {layers.sr &&
        indicators.sr.levels.map((level, i) => {
          const y = yAt(level.price);
          if (y == null || !plotArea) return null;
          const color = level.type === "support" ? COLORS.support : COLORS.resistance;
          return (
            <g key={`sr-${i}`}>
              <line
                x1={plotArea.x}
                y1={y}
                x2={plotArea.x + plotArea.width}
                y2={y}
                stroke={color}
                strokeWidth={1 + level.strength}
                strokeDasharray="8 4"
                opacity={0.6 + level.strength * 0.4}
              />
              <text
                x={plotArea.x + plotArea.width - 4}
                y={y - 3}
                textAnchor="end"
                fontSize={9}
                fill={color}
                fontWeight={500}
              >
                {level.type === "support" ? "S" : "R"} {formatChartPrice(level.price)}
              </text>
            </g>
          );
        })}

      {layers.wyckoff && indicators.wyckoff.tradingRange && (
        <g>
          {(() => {
            const tr = indicators.wyckoff.tradingRange!;
            const x1 = xAt(tr.startIndex) ?? plotArea?.x ?? 0;
            const x2 = xAt(tr.endIndex) ?? plotRight;
            const yTop = yAt(tr.top);
            const yBot = yAt(tr.bottom);
            if (yTop == null || yBot == null) return null;
            return (
              <rect
                x={x1}
                y={Math.min(yTop, yBot)}
                width={Math.max(x2 - x1, 10)}
                height={Math.abs(yBot - yTop)}
                fill={COLORS.wyckoffRange}
                stroke="#3b82f6"
                strokeWidth={1}
                strokeDasharray="6 4"
                rx={2}
              />
            );
          })()}
        </g>
      )}

      {layers.wyckoff &&
        indicators.wyckoff.events.map((ev, i) => {
          const x = xAt(ev.index);
          const y = yAt(ev.price);
          if (x == null || y == null) return null;
          return (
            <g key={`wy-${i}`}>
              <circle cx={x} cy={y} r={4} fill={COLORS.wyckoffEvent} />
              <text
                x={x}
                y={y - 8}
                textAnchor="middle"
                fontSize={8}
                fill={COLORS.wyckoffEvent}
                fontWeight={700}
              >
                {ev.event}
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
}: {
  active?: boolean;
  payload?: { payload?: OhlcPoint }[];
  currency: string;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
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
        {p.volume > 0 && (
          <>
            <span className="text-gray-500">Vol</span>
            <span>{p.volume.toLocaleString("vi-VN")}</span>
          </>
        )}
      </div>
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

function WyckoffPanel({ indicators, currency }: { indicators: BenDangIndicators; currency: string }) {
  const w = indicators.wyckoff;
  const phaseColors: Record<string, string> = {
    accumulation: "bg-emerald-50 text-emerald-800 border-emerald-200",
    markup: "bg-sky-50 text-sky-800 border-sky-200",
    distribution: "bg-amber-50 text-amber-800 border-amber-200",
    markdown: "bg-rose-50 text-rose-800 border-rose-200",
    unknown: "bg-gray-50 text-gray-700 border-gray-200",
  };

  return (
    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
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
          <div className="text-right text-xs text-gray-600">
            <p>
              Vùng GD: {formatMoney(w.tradingRange.bottom, currency)} –{" "}
              {formatMoney(w.tradingRange.top, currency)}
            </p>
          </div>
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-xs text-gray-500">Xu hướng</dt>
          <dd className="font-medium">{w.summary.trend}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-xs text-gray-500">Volume</dt>
          <dd className="font-medium">{w.summary.volumePattern}</dd>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-xs text-gray-500">Gợi ý</dt>
          <dd className="font-medium">{w.summary.recommendation}</dd>
        </div>
      </dl>

      {w.events.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {w.events.map((ev, i) => (
            <span
              key={`${ev.event}-${ev.index}-${i}`}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
              title={ev.label}
            >
              {ev.event}
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
    { key: "smc", label: "SMC" },
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
}: {
  symbol: string;
  currency: string;
}) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1d");
  const [points, setPoints] = useState<OhlcPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<BenDangLayers>(DEFAULT_LAYERS);

  useEffect(() => {
    let cancelled = false;
    const startFetch = () => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    };
    const tid = globalThis.setTimeout(startFetch, 0);

    const controller = new AbortController();
    fetch(`/api/stock/${encodeURIComponent(symbol)}/history?timeframe=${timeframe}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          setPoints([]);
          return;
        }
        setPoints(json.points ?? []);
      })
      .catch((e) => {
        if (cancelled || e.name === "AbortError") return;
        setError("Không tải được biểu đồ");
        setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      globalThis.clearTimeout(tid);
      controller.abort();
    };
  }, [symbol, timeframe]);

  const indicators = useMemo(
    () => (points.length > 5 ? computeBenDangIndicators(points) : null),
    [points]
  );

  const currentPrice = points.length ? points[points.length - 1].close : 0;

  const yDomain = useMemo(
    () =>
      indicators
        ? computeChartYDomain(points, { extras: indicatorExtras(indicators) })
        : computeChartYDomain(points),
    [points, indicators]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Phân tích kĩ thuật</h3>
          <p className="text-xs text-gray-500">SMC · Hỗ trợ/Kháng cự · Wyckoff</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {CHART_TIMEFRAMES.map((tf) => (
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
          <div className="min-w-0 w-full h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} barCategoryGap="20%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: TICK, fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickFormatter={(value) => {
                    const p = points.find((pt) => pt.date === value);
                    return p?.label ?? String(value).slice(0, 10);
                  }}
                />
                <YAxis
                  tick={{ fill: TICK, fontSize: 10 }}
                  domain={yDomain}
                  width={64}
                  tickFormatter={formatChartPrice}
                  allowDecimals
                  tickCount={6}
                />
                <Tooltip content={<ChartTooltip currency={currency} />} />
                <Bar dataKey="close" fill="transparent" isAnimationActive={false} />
                <IndicatorOverlays data={points} indicators={indicators} layers={layers} />
                <Candlesticks data={points} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {layers.sr && (
            <SrLevelsPanel
              levels={indicators.sr.levels}
              currency={currency}
              currentPrice={currentPrice}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-blue-500" /> BOS
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-amber-500" style={{ borderTop: "1px dashed" }} /> CHoCH
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-emerald-200" /> OB tăng
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-rose-200" /> OB giảm
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-emerald-500" style={{ borderTop: "1px dashed" }} /> Hỗ trợ
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 bg-rose-500" style={{ borderTop: "1px dashed" }} /> Kháng cự
            </span>
          </div>

          {layers.wyckoff && <WyckoffPanel indicators={indicators} currency={currency} />}
        </>
      )}
    </div>
  );
}
