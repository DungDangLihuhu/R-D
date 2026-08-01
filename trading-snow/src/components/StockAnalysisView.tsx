"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExternalLink, Search } from "lucide-react";
import { SymbolAvatar } from "@/components/SymbolAvatar";
import { useApp } from "@/context/AppContext";
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatShares,
} from "@/lib/format";
import type { PriceLevels, StockAnalysis } from "@/lib/stock-analysis";

const GRID = "#e2e5ea";
const TICK = "#6b7280";
const CHART_COLORS = {
  price: "#0ea5e9",
  targetAnalyst: "#8b5cf6",
  targetFundamental: "#f59e0b",
  support: "#10b981",
  resistance: "#ef4444",
} as const;

function chartYDomain(
  closes: number[],
  levels: PriceLevels
): [number, number] {
  const all = [...closes];
  if (levels.targetAnalyst) all.push(levels.targetAnalyst.price);
  if (levels.targetFundamental) all.push(levels.targetFundamental.price);
  for (const s of levels.support) all.push(s.price);
  for (const r of levels.resistance) all.push(r.price);
  if (!all.length) return [0, 100];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.06 || max * 0.05;
  return [min - pad, max + pad];
}

export function StockAnalysisView({ symbol }: { symbol: string }) {
  const router = useRouter();
  const { stats } = useApp();
  const [data, setData] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(symbol);

  const holdings = useMemo(
    () => [...new Set(stats.holdings.map((h) => h.symbol))],
    [stats.holdings]
  );

  useEffect(() => {
    setSearchQuery(symbol);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stock/${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
          return;
        }
        setData(json);
      })
      .catch(() => setError("Không tải được dữ liệu phân tích"))
      .finally(() => setLoading(false));
  }, [symbol]);

  const chartData = useMemo(
    () =>
      (data?.priceHistory ?? []).map((p) => ({
        label: p.date.slice(5),
        close: p.close,
      })),
    [data?.priceHistory]
  );

  const yDomain = useMemo(
    () =>
      data?.priceLevels
        ? chartYDomain(
            chartData.map((d) => d.close),
            data.priceLevels
          )
        : (["auto", "auto"] as const),
    [chartData, data?.priceLevels]
  );

  const priceLevels = data?.priceLevels;

  const holding = stats.holdings.find((h) => h.symbol === symbol);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phân tích</h1>
          <p className="text-sm text-gray-500">
            Chỉ số cơ bản · báo cáo · tin tức · giao dịch nội bộ (Yahoo + Finnhub)
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[20rem]">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const next = searchQuery.trim().toUpperCase();
              if (next) router.push(`/stock/${encodeURIComponent(next)}`);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Nhập mã (AAPL, NVDA, BNP.PA…)"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Xem
            </button>
          </form>
          {holdings.length > 0 && (
            <select
              value={holdings.includes(symbol) ? symbol : ""}
              onChange={(e) => {
                if (e.target.value) {
                  router.push(`/stock/${encodeURIComponent(e.target.value)}`);
                }
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Mã trong danh mục…</option>
              {holdings.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {holdings.length === 0 && !symbol && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Nhập mã ở thanh tìm kiếm phía trên (vd AAPL, NVDA).
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-500">Đang tải dữ liệu {symbol}...</p>
      )}

      {error && !loading && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {data && !loading && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start gap-4">
              {data.logo ? (
                <img
                  src={data.logo}
                  alt=""
                  className="h-12 w-12 rounded-lg border border-gray-100 object-contain"
                />
              ) : (
                <SymbolAvatar symbol={data.symbol} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold">{data.symbol}</h2>
                  {data.exchange && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {data.exchange}
                    </span>
                  )}
                </div>
                <p className="text-gray-600">{data.name}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatMoney(data.price, data.currency)}
                  </span>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      data.changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatPercent(data.changePercent)}
                  </span>
                  {data.high52 != null && data.low52 != null && (
                    <span className="text-xs text-gray-500">
                      52w: {data.low52.toFixed(2)} – {data.high52.toFixed(2)}
                    </span>
                  )}
                </div>
                {holding && (
                  <p className="mt-1 text-xs text-gray-500">
                    Trong danh mục: {formatShares(holding.quantity)} cp · vốn{" "}
                    {formatMoney(holding.totalCost)}
                  </p>
                )}
                {data.website && (
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600"
                  >
                    Website <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            {data.note && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {data.note}
              </p>
            )}
          </div>

          {chartData.length > 1 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 font-semibold">Biểu đồ giá (12 tháng)</h3>
              <div className="min-w-0 w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: TICK, fontSize: 10 }} domain={yDomain} width={56} />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e2e5ea",
                        borderRadius: 8,
                      }}
                      formatter={(v) => [formatMoney(Number(v ?? 0), data.currency), "Giá"]}
                    />
                    {priceLevels?.support.map((s) => (
                      <ReferenceLine
                        key={`s-${s.label}-${s.price}`}
                        y={s.price}
                        stroke={CHART_COLORS.support}
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                      />
                    ))}
                    {priceLevels?.resistance.map((r) => (
                      <ReferenceLine
                        key={`r-${r.label}-${r.price}`}
                        y={r.price}
                        stroke={CHART_COLORS.resistance}
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                      />
                    ))}
                    {priceLevels?.targetFundamental && (
                      <ReferenceLine
                        y={priceLevels.targetFundamental.price}
                        stroke={CHART_COLORS.targetFundamental}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                    )}
                    {priceLevels?.targetAnalyst && (
                      <ReferenceLine
                        y={priceLevels.targetAnalyst.price}
                        stroke={CHART_COLORS.targetAnalyst}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                    )}
                    <Line type="monotone" dataKey="close" stroke={CHART_COLORS.price} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {priceLevels && (
                <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <LegendDot color={CHART_COLORS.price} label="Giá đóng cửa" />
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
                        currency={data.currency}
                        color={CHART_COLORS.targetAnalyst}
                      />
                    )}
                    {priceLevels.targetFundamental && (
                      <LevelCard
                        title="Giá trị hợp lý (cơ bản)"
                        price={priceLevels.targetFundamental.price}
                        upside={priceLevels.targetFundamental.upsidePercent}
                        method={priceLevels.targetFundamental.method}
                        currency={data.currency}
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
                          {formatMoney(s.price, data.currency)}
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
                          {formatMoney(r.price, data.currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.sections.map((section) => (
              <MetricSection key={section.id} title={section.title} metrics={section.metrics} />
            ))}
          </div>

          {data.earningsUpcoming.length > 0 && (
            <Section title="Lịch công bố KQKD sắp tới">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="pb-2 pr-4">Ngày</th>
                      <th className="pb-2 pr-4">Kỳ</th>
                      <th className="pb-2 pr-4">Giờ</th>
                      <th className="pb-2 text-right">EPS dự báo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earningsUpcoming.map((e, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{formatDate(e.date)}</td>
                        <td className="py-2 pr-4">Q{e.quarter} {e.year}</td>
                        <td className="py-2 pr-4">
                          {e.hour === "bmo" ? "Trước mở cửa" : e.hour === "amc" ? "Sau đóng cửa" : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {e.epsEstimate != null ? e.epsEstimate.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {data.earningsHistory.length > 0 && (
            <Section title="Lịch sử EPS">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="pb-2 pr-4">Kỳ</th>
                      <th className="pb-2 pr-4 text-right">Dự báo</th>
                      <th className="pb-2 pr-4 text-right">Thực tế</th>
                      <th className="pb-2 text-right">Bất ngờ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earningsHistory.map((e, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{e.period}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {e.estimate?.toFixed(2) ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {e.actual?.toFixed(2) ?? "—"}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            (e.surprisePercent ?? 0) >= 0
                              ? "text-emerald-600"
                              : "text-rose-600"
                          }`}
                        >
                          {e.surprisePercent != null
                            ? formatPercent(e.surprisePercent)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {data.recommendations.length > 0 && (
            <Section title="Khuyến nghị analyst">
              <div className="space-y-2">
                {data.recommendations.slice(0, 4).map((r, i) => {
                  const total =
                    r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
                  const bullish = r.strongBuy + r.buy;
                  return (
                    <div key={i} className="text-sm">
                      <div className="mb-1 flex justify-between text-xs text-gray-500">
                        <span>{r.period}</span>
                        <span>
                          Mua {bullish}/{total} · Giữ {r.hold} · Bán {r.sell + r.strongSell}
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${(bullish / total) * 100}%` }}
                        />
                        <div
                          className="bg-amber-400"
                          style={{ width: `${(r.hold / total) * 100}%` }}
                        />
                        <div
                          className="bg-rose-500"
                          style={{ width: `${((r.sell + r.strongSell) / total) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {data.insiderTransactions.length > 0 && (
            <Section title="Giao dịch nội bộ">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="pb-2 pr-4">Ngày</th>
                      <th className="pb-2 pr-4">Người</th>
                      <th className="pb-2 pr-4 text-right">Thay đổi CP</th>
                      <th className="pb-2 text-right">Còn lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.insiderTransactions.map((t, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{formatDate(t.date)}</td>
                        <td className="py-2 pr-4">{t.name}</td>
                        <td
                          className={`py-2 pr-4 text-right tabular-nums ${
                            t.change >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {t.change >= 0 ? "+" : ""}
                          {formatShares(t.change)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatShares(t.shares)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {data.news.length > 0 && (
            <Section title="Tin tức">
              <ul className="space-y-3">
                {data.news.map((n, i) => (
                  <li key={i} className="border-b border-gray-100 pb-3 last:border-0">
                    {n.url ? (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {n.headline}
                      </a>
                    ) : (
                      <p className="font-medium">{n.headline}</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatDate(n.date)}
                      {n.source ? ` · ${n.source}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data.peers.length > 0 && (
            <Section title="Cùng ngành">
              <div className="flex flex-wrap gap-2">
                {data.peers.map((p) => (
                  <Link
                    key={p}
                    href={`/stock/${p}`}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm hover:bg-sky-50 hover:border-sky-200"
                  >
                    {p}
                  </Link>
                ))}
              </div>
            </Section>
          )}

          <p className="text-xs text-gray-400">
            Nguồn: {data.sources.join(", ")} · chỉ mang tính tham khảo
          </p>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function MetricSection({
  title,
  metrics,
}: {
  title: string;
  metrics: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-1.5 text-sm"
          >
            <dt className="text-gray-500">{m.label}</dt>
            <dd className="font-medium tabular-nums text-right">{m.value}</dd>
          </div>
        ))}
      </dl>
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
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: `${color}40`, background: `${color}10` }}>
      <p className="text-xs font-medium" style={{ color }}>
        {title}
      </p>
      <p className="text-sm font-semibold tabular-nums">{formatMoney(price, currency)}</p>
      <p
        className={`text-xs tabular-nums ${
          upside >= 0 ? "text-emerald-600" : "text-rose-600"
        }`}
      >
        {formatPercent(upside)} so với giá hiện tại
      </p>
      <p className="mt-0.5 text-[10px] text-gray-500">{method}</p>
    </div>
  );
}
