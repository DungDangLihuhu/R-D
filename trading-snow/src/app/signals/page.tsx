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
  type SignalTimeframe,
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

interface HoldingSignal {
  symbol: string;
  marketPrice: number;
  hits: WyckoffBuyHit[];
}

interface SignalsResponse {
  signals?: HoldingSignal[];
  scanned?: number;
  quotes?: SignalQuote[];
  error?: string;
}

const PHASE_CLASS: Record<string, string> = {
  accumulation:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  markup:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  distribution:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  markdown:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  unknown:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
};

function distTone(distPct: number) {
  if (Math.abs(distPct) <= 1) return "text-emerald-600 dark:text-emerald-300";
  if (distPct < 0) return "text-sky-600 dark:text-sky-300";
  return "text-amber-600 dark:text-amber-300";
}

function actionLabel(action: WyckoffBuyHit["entryAction"]) {
  return action === "buy" ? "Có thể vào" : "Giá sát mốc";
}

function stopClass(entryPrice: number, stop: number | null) {
  if (stop == null || !(stop > 0)) return "text-app-muted";
  if (stop >= entryPrice) return "font-semibold text-rose-600 dark:text-rose-300";
  return "text-app-muted";
}

function HitLevels({
  hits,
  currency,
}: {
  hits: WyckoffBuyHit[];
  currency: string;
}) {
  const bestTf = hits[0]?.timeframe;
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
              <td className="py-0.5 pr-3 text-app-text">{formatMoney(hit.entryPrice, currency)}</td>
              <td className={`py-0.5 ${stopClass(hit.entryPrice, hit.stop)}`}>
                {hit.stop != null && hit.stop > 0 ? formatMoney(hit.stop, currency) : "—"}
                {hit.stop != null && hit.stop >= hit.entryPrice ? " (lỗi mốc)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalsResults({
  symbolsKey,
  currency,
  marketQuotes,
}: {
  symbolsKey: string;
  currency: string;
  marketQuotes?: Record<string, MarketQuote>;
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
  const signals = payload?.signals ?? [];
  const scanned = payload?.scanned ?? symbolsKey.split(",").filter(Boolean).length;
  const bandPct = Math.round(BUY_PRICE_BAND * 100);
  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, SignalQuote>();
    for (const q of payload?.quotes ?? []) map.set(q.symbol, q);
    return map;
  }, [payload]);

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
          <li>Quét bốn khung 1H / 4H / 1D / 1W, lấy mốc Wyckoff của trang Phân tích.</li>
          <li>Bỏ qua lệnh long có cắt lỗ ≥ giá vào, hoặc giá đã thủng cắt lỗ.</li>
          <li>Bỏ qua giai đoạn phân phối và các mốc được đánh dấu tránh long.</li>
          <li>Đây là kịch bản có điều kiện, không phải khuyến nghị mua.</li>
        </ul>
      </details>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Mã đang quét" value={String(scanned)} />
        <StatCard
          label="Đang trong vùng mua"
          value={loading ? "…" : String(signals.length)}
          trend={signals.length > 0 ? "up" : "neutral"}
        />
        <StatCard label="Dải giá" value={`±${bandPct}%`} sub="so với giá vào Wyckoff" />
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
        <div className="space-y-3">
          {signals.map((signal) => {
            const best = signal.hits[0];
            const quote = quoteBySymbol.get(signal.symbol);
            const ctxQuote = marketQuotes?.[signal.symbol];
            return (
              <Link
                key={signal.symbol}
                href={`/stock/${encodeURIComponent(signal.symbol)}`}
                className="app-card block transition-opacity hover:opacity-95"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <SymbolIdentity
                      symbol={signal.symbol}
                      name={quote?.name ?? ctxQuote?.name}
                      logo={quote?.logo ?? ctxQuote?.logo}
                    />
                    <p
                      className={`inline-block rounded-lg border px-2.5 py-1 text-sm font-semibold ${
                        PHASE_CLASS[best.phase] ?? PHASE_CLASS.unknown
                      }`}
                    >
                      {best.phaseLabel}
                    </p>
                    <HitLevels hits={signal.hits} currency={currency} />
                    <p className="text-xs font-medium text-app-text">
                      {actionLabel(best.entryAction)}
                    </p>
                    <p className="text-xs leading-relaxed text-app-muted">{best.reason}</p>
                  </div>
                  {/* Giá vào và cắt lỗ đã nằm trong bảng bên trái — ở đây chỉ
                      tóm tắt vị trí giá hiện tại so với mốc. */}
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="text-xs text-app-muted">Giá thị trường</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatMoney(signal.marketPrice, currency)}
                    </p>
                    <p className={`mt-1 text-xs font-semibold tabular-nums ${distTone(best.distPct)}`}>
                      {formatPercent(best.distPct)} so với {best.entryLabel}
                    </p>
                    <p className="mt-2 text-xs text-app-muted">
                      Tin cậy {best.confidenceLabel} · {best.confidence}/100
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function SignalsPage() {
  const { stats, state, activePortfolioId } = useApp();
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
      />
    </div>
  );
}
