"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { SessionBadge } from "@/components/SessionBadge";
import { SymbolAvatar } from "@/components/SymbolAvatar";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { fetchJson } from "@/lib/fetch-cache";
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatShares,
} from "@/lib/format";
import type { StockAnalysis, StockAnalysisExtra } from "@/lib/stock-analysis";
import type { MarketSession } from "@/lib/types";
import {
  assessmentBg,
  assessmentColor,
  signalScoreLabel,
  type StockAssessment,
} from "@/lib/stock-assessment";

const QUOTE_REFRESH_MS = 5 * 60 * 1000;

type LiveQuote = {
  price: number;
  change: number;
  changePercent: number;
  marketSession?: MarketSession;
};

function toLiveQuote(q: {
  price?: number;
  change?: number;
  changePercent?: number;
  marketSession?: MarketSession;
} | null | undefined): LiveQuote | null {
  if (!q || !(q.price != null && q.price > 0)) return null;
  return {
    price: q.price,
    change: q.change ?? 0,
    changePercent: q.changePercent ?? 0,
    marketSession: q.marketSession,
  };
}

const BenDangChart = dynamic(
  () => import("@/components/BenDangChart").then((m) => m.BenDangChart),
  { loading: () => <ChartSkeleton /> }
);

const StockPriceChart = dynamic(
  () => import("@/components/StockPriceChart").then((m) => m.StockPriceChart),
  { loading: () => <ChartSkeleton /> }
);

interface SearchSuggestion {
  symbol: string;
  name: string;
  exchange?: string;
  source?: "portfolio" | "yahoo";
}

function ChartSkeleton() {
  return (
    <div className="h-[22rem] app-skeleton" />
  );
}

function AnalysisSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-28 app-skeleton" />
      <div className="h-40 app-skeleton" />
      <ChartSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 app-skeleton" />
        <div className="h-48 app-skeleton" />
      </div>
    </div>
  );
}

function insiderActionLabel(code: string, change: number): string {
  const c = code.toUpperCase();
  if (c === "P" || c === "A") return "Mua";
  if (c === "S" || c === "D") return "Bán";
  return change < 0 ? "Bán" : "Mua";
}

export function StockAnalysisView({ symbol }: { symbol: string }) {
  const router = useRouter();
  const { stats, state } = useApp();
  const [data, setData] = useState<StockAnalysis | null>(null);
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [extraLoading, setExtraLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(symbol);
  const [syncedSymbol, setSyncedSymbol] = useState(symbol);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [chartMode, setChartMode] = useState<"fundamental" | "technical">("technical");
  const searchRef = useRef<HTMLDivElement>(null);

  if (symbol !== syncedSymbol) {
    setSyncedSymbol(symbol);
    setSearchQuery(symbol);
    setShowSuggestions(false);
    setActiveIndex(-1);
    setLiveQuote(null);
  }

  const holdings = useMemo(
    () => [...new Set(stats.holdings.map((h) => h.symbol))],
    [stats.holdings]
  );

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!showSuggestions || q.length < 1) return;

    const portfolioMatches: SearchSuggestion[] = holdings
      .filter((s) => s.includes(q.toUpperCase()))
      .map((s) => ({ symbol: s, name: "Trong danh mục", source: "portfolio" as const }));

    let controller: AbortController | null = null;
    const timer = globalThis.setTimeout(() => {
      setSearchLoading(true);
      controller = new AbortController();
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((json: { results?: SearchSuggestion[] }) => {
          const remote = (json.results ?? []).map((r) => ({
            ...r,
            source: "yahoo" as const,
          }));
          const seen = new Set(portfolioMatches.map((m) => m.symbol));
          const merged = [
            ...portfolioMatches,
            ...remote.filter((r) => !seen.has(r.symbol)),
          ];
          setSuggestions(merged.slice(0, 8));
          setActiveIndex(merged.length ? 0 : -1);
        })
        .catch(() => {
          setSuggestions(portfolioMatches);
          setActiveIndex(portfolioMatches.length ? 0 : -1);
        })
        .finally(() => setSearchLoading(false));
    }, 250);

    return () => {
      globalThis.clearTimeout(timer);
      controller?.abort();
    };
  }, [searchQuery, showSuggestions, holdings]);

  const visibleSuggestions =
    showSuggestions && searchQuery.trim().length >= 1 ? suggestions : [];

  const goToSymbol = (next: string) => {
    const sym = next.trim().toUpperCase();
    if (!sym) return;
    setShowSuggestions(false);
    setActiveIndex(-1);
    router.push(`/stock/${encodeURIComponent(sym)}`);
  };

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetchJson<StockAnalysis>(`/api/stock/${encodeURIComponent(symbol)}`, {
      ttlMs: 5 * 60 * 1000,
    })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được dữ liệu phân tích");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (!symbol || !data) return;

    let cancelled = false;
    setExtraLoading(true);

    fetchJson<StockAnalysisExtra>(`/api/stock/${encodeURIComponent(symbol)}/extra`, {
      ttlMs: 10 * 60 * 1000,
    })
      .then((extra) => {
        if (cancelled) return;
        setData((prev) =>
          prev
            ? {
                ...prev,
                peers: extra.peers,
                insiderTransactions: extra.insiderTransactions,
                news: extra.news,
                assessment: extra.assessment,
              }
            : prev
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setExtraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, data?.symbol]);

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;

    const pull = async () => {
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          quotes?: {
            symbol: string;
            price: number;
            change: number;
            changePercent: number;
            marketSession?: MarketSession;
          }[];
        };
        const row =
          json.quotes?.find((q) => q.symbol.toUpperCase() === symbol.toUpperCase()) ??
          json.quotes?.[0];
        const next = toLiveQuote(row);
        if (!cancelled && next) setLiveQuote(next);
      } catch {
        /* keep last quote */
      }
    };

    void pull();
    const id = globalThis.setInterval(pull, QUOTE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      globalThis.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbol]);

  const dailySeed = useMemo(
    () => data?.priceHistory,
    [data?.priceHistory]
  );

  const holding = stats.holdings.find((h) => h.symbol === symbol);
  const ctxQuote = toLiveQuote(state.marketQuotes?.[symbol]);
  const analysisQuote = data
    ? toLiveQuote({
        price: data.price,
        change: data.change,
        changePercent: data.changePercent,
        marketSession: data.marketSession,
      })
    : null;
  const quote = liveQuote ?? ctxQuote ?? analysisQuote;
  const extendedSession =
    quote?.marketSession === "pre" || quote?.marketSession === "post"
      ? quote.marketSession
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="app-page-title">Phân tích</h1>
          <p className="app-page-desc">
            Chỉ số cơ bản · báo cáo · tin tức · nội bộ · giá Yahoo (pre-market & after-hours, mỗi 5 phút)
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[20rem]">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (activeIndex >= 0 && visibleSuggestions[activeIndex]) {
                goToSymbol(visibleSuggestions[activeIndex].symbol);
                return;
              }
              goToSymbol(searchQuery);
            }}
          >
            <div ref={searchRef} className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value.toUpperCase());
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (searchQuery.trim()) setShowSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (!showSuggestions || !visibleSuggestions.length) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIndex((i) => (i + 1) % visibleSuggestions.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIndex((i) =>
                      i <= 0 ? visibleSuggestions.length - 1 : i - 1
                    );
                  } else if (e.key === "Escape") {
                    setShowSuggestions(false);
                    setActiveIndex(-1);
                  }
                }}
                placeholder="Nhập mã (AAPL, NVDA, BNP.PA…)"
                className="app-input w-full py-2 pl-9 pr-3"
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions && visibleSuggestions.length > 0}
                aria-autocomplete="list"
              />
              {showSuggestions && searchQuery.trim() && (
                <ul
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  role="listbox"
                >
                  {searchLoading && visibleSuggestions.length === 0 && (
                    <li className="px-3 py-2 text-sm text-gray-500">Đang tìm…</li>
                  )}
                  {!searchLoading && visibleSuggestions.length === 0 && (
                    <li className="px-3 py-2 text-sm text-gray-500">Không có gợi ý</li>
                  )}
                  {visibleSuggestions.map((s, i) => (
                    <li key={s.symbol} role="option" aria-selected={i === activeIndex}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                          i === activeIndex ? "bg-sky-50 text-sky-900" : "hover:bg-gray-50"
                        }`}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => goToSymbol(s.symbol)}
                      >
                        <SymbolIdentity
                          symbol={s.symbol}
                          name={s.name}
                          size="sm"
                          nameClassName="min-w-0 flex-1 truncate text-sm text-gray-700"
                          className="flex-1"
                        />
                        {s.source === "portfolio" ? (
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                            DM
                          </span>
                        ) : s.exchange ? (
                          <span className="shrink-0 text-[10px] text-gray-400">{s.exchange}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="submit"
              className="app-btn-primary shrink-0"
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
              className="app-input"
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

      {loading && <AnalysisSkeleton />}

      {error && !loading && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {data && !loading && (
        <>
          <div className="app-card p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-4">
                {data.logo ? (
                  <img
                    src={data.logo}
                    alt=""
                    className="h-12 w-12 rounded-lg border border-gray-100 object-contain bg-white p-0.5"
                  />
                ) : (
                  <SymbolAvatar symbol={data.symbol} logo={data.logo} />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold leading-tight">{data.name}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-500 tabular-nums">
                      {data.symbol}
                    </p>
                    {data.exchange && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {data.exchange}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <span className="text-2xl font-semibold tabular-nums">
                        {formatMoney(quote?.price ?? data.price, data.currency)}
                      </span>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          (quote?.changePercent ?? data.changePercent) >= 0
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }`}
                      >
                        {formatPercent(quote?.changePercent ?? data.changePercent)}
                      </span>
                      {data.high52 != null && data.low52 != null && (
                        <span className="text-xs text-gray-500">
                          52w: {data.low52.toFixed(2)} – {data.high52.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <SessionBadge
                      session={extendedSession}
                      changePercent={extendedSession ? quote?.changePercent : null}
                    />
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
              <AssessmentVerdict assessment={data.assessment} currency={data.currency} />
            </div>
            {data.note && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {data.note}
              </p>
            )}
            <AssessmentSignals assessment={data.assessment} />
            {extraLoading && (
              <p className="mt-2 text-xs text-gray-400">Đang tải tin tức & nội bộ...</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="app-segmented">
                <button
                  type="button"
                  onClick={() => setChartMode("technical")}
                  className={`app-segmented-item ${
                    chartMode === "technical" ? "app-segmented-item-active" : ""
                  }`}
                >
                  Phân tích kĩ thuật
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("fundamental")}
                  className={`app-segmented-item ${
                    chartMode === "fundamental" ? "app-segmented-item-active" : ""
                  }`}
                >
                  Phân tích cơ bản
                </button>
              </div>
            </div>

            {chartMode === "technical" ? (
              <BenDangChart
                symbol={data.symbol}
                currency={data.currency}
                dailySeed={dailySeed}
              />
            ) : (
              <StockPriceChart
                symbol={data.symbol}
                currency={data.currency}
                priceLevels={data.priceLevels}
                dailySeed={dailySeed}
              />
            )}
          </div>

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
                      <th className="pb-2 pr-4">Chức vụ</th>
                      <th className="pb-2 pr-4">Loại</th>
                      <th className="pb-2 pr-4 text-right">Giá</th>
                      <th className="pb-2 pr-4 text-right">Thay đổi CP</th>
                      <th className="pb-2 pr-4 text-right">Số tiền</th>
                      <th className="pb-2 text-right">Còn lại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.insiderTransactions.map((t, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 pr-4">{formatDate(t.date)}</td>
                        <td className="py-2 pr-4">{t.name}</td>
                        <td className="py-2 pr-4 text-gray-600">
                          {t.relationship ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <span
                            className={
                              t.change < 0
                                ? "text-rose-600"
                                : "text-emerald-600"
                            }
                          >
                            {insiderActionLabel(t.transactionCode, t.change)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {t.transactionPrice != null && t.transactionPrice > 0
                            ? formatMoney(t.transactionPrice, data.currency)
                            : "—"}
                        </td>
                        <td
                          className={`py-2 pr-4 text-right tabular-nums ${
                            t.change >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {t.change >= 0 ? "+" : ""}
                          {formatShares(t.change)}
                        </td>
                        <td
                          className={`py-2 pr-4 text-right tabular-nums ${
                            (t.amount ?? t.change) >= 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {t.amount != null
                            ? `${t.amount >= 0 ? "+" : ""}${formatMoney(t.amount, data.currency)}`
                            : "—"}
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

function AssessmentVerdict({
  assessment,
  currency,
}: {
  assessment: StockAssessment;
  currency: string;
}) {
  return (
    <div
      className={`w-full shrink-0 self-start rounded-xl border px-3 py-3 lg:ml-auto lg:w-80 ${assessmentBg(assessment.rating)}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        Đánh giá tổng hợp
      </p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p className={`text-xl font-bold leading-tight ${assessmentColor(assessment.rating)}`}>
          {assessment.label}
        </p>
        <p className="text-xs text-gray-500">Điểm {assessment.score}/100</p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div className="min-w-0">
          <dt className="text-[11px] text-gray-600">Mốc mua</dt>
          <dd className="font-semibold tabular-nums text-emerald-700">
            {formatMoney(assessment.buyPrice, currency)}
          </dd>
          <p
            className="mt-0.5 truncate text-[11px] leading-snug text-gray-500"
            title={assessment.buyNote}
          >
            {assessment.buyNote}
          </p>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-gray-600">Mốc bán</dt>
          <dd className="font-semibold tabular-nums text-rose-700">
            {formatMoney(assessment.sellPrice, currency)}
          </dd>
          <p
            className="mt-0.5 truncate text-[11px] leading-snug text-gray-500"
            title={assessment.sellNote}
          >
            {assessment.sellNote}
          </p>
        </div>
      </dl>
    </div>
  );
}

function AssessmentSignals({ assessment }: { assessment: StockAssessment }) {
  return (
    <div className="mt-4">
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {assessment.signals.map((s) => (
          <li
            key={s.id}
            className="min-w-0 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-2"
          >
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <p className="truncate font-medium text-gray-700">{s.label}</p>
              <span
                className={`shrink-0 tabular-nums font-semibold ${
                  !s.available
                    ? "text-gray-400"
                    : s.score > 0.08
                      ? "text-emerald-700"
                      : s.score < -0.08
                        ? "text-rose-700"
                        : "text-gray-600"
                }`}
              >
                {signalScoreLabel(s.score, s.available)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] leading-snug text-gray-500" title={s.detail}>
              {s.detail}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-gray-500">
        Mốc mua/bán kết hợp S/R với PEG · P/E · P/FCF. Thiếu dữ liệu thì chỉ dùng kỹ thuật. Chỉ tham
        khảo, không phải lệnh.
      </p>
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
    <div className="app-card p-4">
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
  metrics: { label: string; value: string; tone?: "positive" | "negative" }[];
}) {
  return (
    <div className="app-card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex items-baseline justify-between gap-2 border-b border-gray-50 py-1.5 text-sm"
          >
            <dt className="text-gray-500">{m.label}</dt>
            <dd
              className={`font-medium tabular-nums text-right ${
                m.tone === "positive"
                  ? "text-emerald-600"
                  : m.tone === "negative"
                    ? "text-rose-600"
                    : ""
              }`}
            >
              {m.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
