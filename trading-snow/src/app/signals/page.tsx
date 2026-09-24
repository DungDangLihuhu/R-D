"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Inbox, Radio, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  BUY_PRICE_BAND,
  SIGNAL_TIMEFRAME_LABELS,
  primaryHit,
  type HoldingSignal,
  type SignalTimeframe,
  type TrendState,
  type WyckoffBuyHit,
} from "@/lib/signals";
import type { MarketQuote } from "@/lib/types";

interface SignalQuote {
  symbol: string;
  price: number;
  name?: string;
  logo?: string;
  changePercent?: number;
}

interface SignalsResponse {
  signals?: HoldingSignal[];
  scanned?: number;
  quotes?: SignalQuote[];
  error?: string;
}

/** Backtest mô phỏng lệnh chờ tại giá vào, cắt lỗ của app — cập nhật khi đổi luật lọc. */
const BACKTEST_NOTE =
  "Backtest 2017–2026 (58 cổ phiếu Mỹ vốn hóa lớn, khung 1D, giữ tối đa 60 phiên): Tín hiệu mua lãi trung bình +4,3%/lệnh, hơn SPY 1,5 điểm %; mốc mua khi giá dưới SMA200 thì kém SPY. Mẫu nhỏ (179 lệnh), mới chạm ngưỡng có ý nghĩa thống kê.";

const PHASE_CLASS: Record<string, string> = {
  accumulation:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  markup:
    "border-brand-line bg-brand-soft text-brand-ink",
  distribution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  markdown:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  unknown:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
};

function distTone(distPct: number) {
  if (Math.abs(distPct) <= 1) return "text-emerald-600 dark:text-emerald-300";
  if (distPct < 0) return "text-brand-ink";
  return "text-amber-600 dark:text-amber-300";
}

function statusLabel(actionable: boolean, hit: WyckoffBuyHit, trend: TrendState) {
  if (actionable) return "Có thể vào";
  if (hit.entryAction === "buy" && trend === "down") return "Ngược xu hướng — giá dưới SMA200 ngày";
  return "Giá sát mốc — chờ xác nhận";
}

function stopClass(entryPrice: number, stop: number | null) {
  if (stop == null || !(stop > 0)) return "text-app-muted";
  if (stop >= entryPrice) return "font-semibold text-rose-600 dark:text-rose-300";
  return "text-app-muted";
}

function HitLevels({
  hits,
  bestTf,
  currency,
  rate,
}: {
  hits: WyckoffBuyHit[];
  bestTf: SignalTimeframe;
  currency: string;
  /** Quy giá niêm yết ra tiền của danh mục (USD). */
  rate: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[18rem] text-left text-xs">
        <thead>
          <tr className="text-[11px] text-app-muted">
            <th className="py-1 pr-3 font-medium">Khung</th>
            <th className="py-1 pr-3 font-medium">Mốc</th>
            <th className="py-1 pr-3 font-medium">Giá vào</th>
            <th className="py-1 font-medium">Cắt lỗ</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((hit) => (
            <tr
              key={hit.timeframe}
              className={`tabular-nums ${hit.timeframe === bestTf ? "font-medium text-app-text" : ""}`}
            >
              <td className="py-0.5 pr-3 font-medium text-app-text">
                {SIGNAL_TIMEFRAME_LABELS[hit.timeframe as SignalTimeframe]}
              </td>
              <td className="py-0.5 pr-3 text-app-muted">{hit.entryLabel}</td>
              <td className="py-0.5 pr-3 text-app-text">
                {formatMoney(hit.entryPrice * rate, currency)}
              </td>
              <td className={`py-0.5 ${stopClass(hit.entryPrice, hit.stop)}`}>
                {hit.stop != null && hit.stop > 0 ? formatMoney(hit.stop * rate, currency) : "—"}
                {hit.stop != null && hit.stop >= hit.entryPrice ? " (lỗi mốc)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalCard({
  signal,
  name,
  logo,
  currency,
  rate,
}: {
  signal: HoldingSignal;
  name?: string;
  logo?: string;
  currency: string;
  rate: number;
}) {
  const { hit: best, actionable } = primaryHit(signal);
  const { state: trend, sma } = signal.trend;
  const trendPct = sma ? (signal.marketPrice / sma - 1) * 100 : null;
  return (
    <Link
      href={`/stock/${encodeURIComponent(signal.symbol)}`}
      className="app-card block transition-opacity hover:opacity-95"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <SymbolIdentity symbol={signal.symbol} name={name} logo={logo} />
          <div className="flex flex-wrap items-center gap-1.5">
            <p
              className={`inline-block rounded-lg border px-2.5 py-1 text-sm font-semibold ${
                PHASE_CLASS[best.phase] ?? PHASE_CLASS.unknown
              }`}
            >
              {best.phaseLabel}
            </p>
            {trend === "down" && (
              <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                Dưới SMA200
              </span>
            )}
          </div>
          <HitLevels hits={signal.hits} bestTf={best.timeframe} currency={currency} rate={rate} />
          <p
            className={`text-xs font-medium ${
              actionable ? "text-emerald-700 dark:text-emerald-300" : "text-app-text"
            }`}
          >
            {statusLabel(actionable, best, trend)}
          </p>
          <p className="text-xs leading-relaxed text-app-muted">{best.reason}</p>
        </div>
        {/* Giá vào và cắt lỗ đã nằm trong bảng bên trái — ở đây chỉ
            tóm tắt vị trí giá hiện tại so với mốc và xu hướng. */}
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs text-app-muted">Giá thị trường</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatMoney(signal.marketPrice * rate, currency)}
          </p>
          <p className={`mt-1 text-xs font-semibold tabular-nums ${distTone(best.distPct)}`}>
            {formatPercent(best.distPct)} so với {best.entryLabel}
          </p>
          {sma != null && trendPct != null ? (
            <p
              className={`mt-1 text-xs tabular-nums ${
                trend === "down" ? "text-rose-600 dark:text-rose-300" : "text-app-muted"
              }`}
            >
              SMA200 ngày {formatMoney(sma * rate, currency)} ({formatPercent(trendPct)})
            </p>
          ) : (
            <p className="mt-1 text-xs text-app-muted">Chưa đủ 200 phiên để xét xu hướng</p>
          )}
          <p className="mt-2 text-xs text-app-muted">
            Tin cậy {best.confidenceLabel} · {best.confidence}/100
          </p>
        </div>
      </div>
    </Link>
  );
}

function SignalsResults({
  symbolsKey,
  currency,
  marketQuotes,
  usdRate,
}: {
  symbolsKey: string;
  currency: string;
  marketQuotes?: Record<string, MarketQuote>;
  usdRate: (symbol: string) => number;
}) {
  const [data, setData] = useState<{ key: string; payload: SignalsResponse } | null>(
    null
  );
  const [fail, setFail] = useState<{ key: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/signals?symbols=${encodeURIComponent(symbolsKey)}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as SignalsResponse;
        if (!res.ok || json.error) {
          throw new Error(json.error ?? "Không quét được tín hiệu");
        }
        return json;
      })
      .then((payload) => {
        setData({ key: symbolsKey, payload });
        setFail(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        setFail({
          key: symbolsKey,
          message: err instanceof Error ? err.message : "Không quét được tín hiệu",
        });
      });
    return () => ac.abort();
  }, [symbolsKey]);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/signals?symbols=${encodeURIComponent(symbolsKey)}&refresh=1`
      );
      const json = (await res.json()) as SignalsResponse;
      if (!res.ok || json.error) {
        setFail({ key: symbolsKey, message: json.error ?? "Không quét được tín hiệu" });
        return;
      }
      setData({ key: symbolsKey, payload: json });
      setFail(null);
    } catch {
      setFail({ key: symbolsKey, message: "Không quét được tín hiệu" });
    } finally {
      setRefreshing(false);
    }
  }

  const payload = data?.key === symbolsKey ? data.payload : null;
  const error = fail?.key === symbolsKey ? fail.message : null;
  const loading = !payload && !error;
  const signals = useMemo(
    () =>
      // Phản hồi cũ còn trong cache (trước khi có bộ lọc xu hướng) chưa có `trend`.
      (payload?.signals ?? []).map((signal) =>
        signal.trend ? signal : { ...signal, trend: { state: "unknown" as const, sma: null } }
      ),
    [payload]
  );
  const scanned = payload?.scanned ?? symbolsKey.split(",").filter(Boolean).length;
  const bandPct = Math.round(BUY_PRICE_BAND * 100);
  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, SignalQuote>();
    for (const q of payload?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [payload]);
  const groups = useMemo(() => {
    const buy: HoldingSignal[] = [];
    const watch: HoldingSignal[] = [];
    for (const signal of signals) {
      (primaryHit(signal).actionable ? buy : watch).push(signal);
    }
    return { buy, watch };
  }, [signals]);

  const card = (signal: HoldingSignal) => {
    const quote = quoteBySymbol.get(signal.symbol);
    const ctxQuote = marketQuotes?.[signal.symbol];
    return (
      <SignalCard
        key={signal.symbol}
        signal={signal}
        name={quote?.name ?? ctxQuote?.name}
        logo={quote?.logo ?? ctxQuote?.logo}
        currency={currency}
        rate={usdRate(signal.symbol)}
      />
    );
  };

  return (
    <>
      <PageHeader
        title="Tín hiệu"
        description={`Mã trong danh mục đang có giá thị trường trong ±${bandPct}% quanh giá vào Wyckoff.`}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || refreshing}
            className="app-btn-secondary inline-flex items-center gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`}
            />
            Quét lại
          </button>
        }
      />

      <details className="text-xs text-app-muted">
        <summary className="cursor-pointer text-app-muted marker:content-['']">
          Cách lọc tín hiệu ▾
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Quét bốn khung 1H / 4H / 1D / 1W, lấy mốc Wyckoff của trang Phân tích; giá thị
            trường phải trong ±{bandPct}% quanh giá vào.
          </li>
          <li>
            Tín hiệu mua cần mốc ở trạng thái có thể vào (tin cậy ≥ 70, giá sát mốc) và giá
            trên SMA200 ngày. Mốc còn chờ xác nhận hoặc ngược xu hướng nằm ở mục Đang theo
            dõi.
          </li>
          <li>
            Cắt lỗ đặt dưới Ice/Spring và cách giá vào ít nhất 3×ATR (khung tuần 2×ATR) để
            không bị dao động thường ngày quét mất.
          </li>
          <li>
            Bỏ qua lệnh long có cắt lỗ ≥ giá vào hoặc giá đã thủng cắt lỗ, giai đoạn phân
            phối và các mốc được đánh dấu tránh long.
          </li>
          <li>{BACKTEST_NOTE} Đây là kịch bản có điều kiện, không phải khuyến nghị mua.</li>
        </ul>
      </details>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Mã đang quét" value={String(scanned)} />
        <StatCard
          label="Tín hiệu mua"
          value={loading ? "…" : String(groups.buy.length)}
          trend={groups.buy.length > 0 ? "up" : "neutral"}
          sub="có thể vào · trên SMA200"
        />
        <StatCard
          label="Đang theo dõi"
          value={loading ? "…" : String(groups.watch.length)}
          sub={`giá trong ±${bandPct}% quanh mốc`}
        />
      </div>

      {error && <div className="app-alert-warning">{error}</div>}

      {loading ? (
        <div className="space-y-3">
          <div className="app-skeleton h-28" />
          <div className="app-skeleton h-28" />
        </div>
      ) : signals.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="Chưa có tín hiệu mua"
          description={`Đã quét ${scanned} mã. Không mã nào có giá vào Wyckoff (không phải avoid) và giá thị trường trong ±${bandPct}%.`}
        />
      ) : (
        <>
          <section className="space-y-3" aria-labelledby="signals-buy">
            <h2 id="signals-buy" className="app-card-section-title mb-0">
              Tín hiệu mua
            </h2>
            {groups.buy.length > 0 ? (
              groups.buy.map(card)
            ) : (
              <p className="app-callout text-xs">
                Chưa mã nào đủ điều kiện mua. Các mã có giá gần mốc Wyckoff nằm ở mục Đang
                theo dõi bên dưới.
              </p>
            )}
          </section>
          {groups.watch.length > 0 && (
            <section className="space-y-3" aria-labelledby="signals-watch">
              <div>
                <h2 id="signals-watch" className="app-card-section-title mb-1">
                  Đang theo dõi
                </h2>
                <p className="text-xs text-app-muted">
                  Giá gần mốc nhưng Wyckoff chưa xác nhận, hoặc giá đang dưới SMA200 ngày —
                  chưa phải điểm mua.
                </p>
              </div>
              {groups.watch.map(card)}
            </section>
          )}
        </>
      )}
    </>
  );
}

export default function SignalsPage() {
  const { stats, state, activePortfolioId, usdRate } = useApp();
  const portfolio = state.portfolios.find((p) => p.id === activePortfolioId);
  const currency = portfolio?.currency ?? "USD";
  const symbols = useMemo(
    () =>
      [...new Set(stats.holdings.map((h) => h.symbol))]
        .filter((symbol) => symbol && symbol !== "CASH")
        .sort(),
    [stats.holdings]
  );
  const symbolsKey = symbols.join(",");
  const bandPct = Math.round(BUY_PRICE_BAND * 100);

  if (symbols.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Tín hiệu"
          description={`Mã trong danh mục có giá thị trường trong ±${bandPct}% giá nên vào Wyckoff (trang Phân tích).`}
        />
        <EmptyState
          icon={Inbox}
          title="Chưa có mã trong danh mục"
          description="Thêm giao dịch mở vị thế rồi quay lại trang này."
          action={
            <Link href="/trades" className="app-btn-primary">
              Thêm giao dịch
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SignalsResults
        key={symbolsKey}
        symbolsKey={symbolsKey}
        currency={currency}
        marketQuotes={state.marketQuotes}
        usdRate={usdRate}
      />
    </div>
  );
}
