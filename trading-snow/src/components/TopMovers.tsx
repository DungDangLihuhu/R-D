"use client";

import Link from "next/link";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { formatMoney, formatPercent } from "@/lib/format";
import type { SymbolPnl } from "@/lib/types";

const TOP = 5;

/** Cùng kiểu dấu với formatPercent: "+1.234 US$" / "-567 US$". */
function signedMoney(value: number): string {
  return `${value >= 0.005 ? "+" : ""}${formatMoney(value)}`;
}

function MoverRow({ item, max }: { item: SymbolPnl; max: number }) {
  const { state } = useApp();
  const quote = state.marketQuotes?.[item.symbol];
  const width = max > 0 ? Math.max(3, (Math.abs(item.total) / max) * 100) : 0;
  const breakdown = [
    `Đã chốt ${signedMoney(item.realized)}`,
    `Đang giữ ${signedMoney(item.unrealized)}`,
    `Cổ tức ${signedMoney(item.dividends)}`,
    `Tổng tiền đã mua ${formatMoney(item.invested)}`,
  ].join(" · ");

  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(item.symbol)}`}
        title={breakdown}
        className="block rounded-lg px-2 py-2 transition-colors hover:bg-app-tint"
      >
        <div className="flex items-center justify-between gap-3">
          <SymbolIdentity symbol={item.symbol} name={quote?.name} logo={quote?.logo} size="sm" />
          <div className="shrink-0 text-right tabular-nums">
            <p className="text-sm font-semibold text-app-text">{signedMoney(item.total)}</p>
            <p className="text-xs text-app-muted">
              {formatPercent(item.percent)} · {item.open ? "Đang giữ" : "Đã bán"}
            </p>
          </div>
        </div>
        {/* Thanh cùng thang cho cả hai cột; màu chỉ mang chiều lãi/lỗ, số viết bằng màu chữ. */}
        <div className="mt-1.5 h-1.5 rounded-full bg-app-tint" aria-hidden>
          <div
            className={`h-1.5 rounded-full ${item.total >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </Link>
    </li>
  );
}

function MoverList({
  title,
  items,
  max,
  empty,
}: {
  title: string;
  items: SymbolPnl[];
  max: number;
  empty: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-app-muted">{title}</h3>
      {items.length > 0 ? (
        <ol className="space-y-0.5">
          {items.map((item) => (
            <MoverRow key={item.symbol} item={item} max={max} />
          ))}
        </ol>
      ) : (
        <p className="px-2 py-3 text-sm text-app-muted">{empty}</p>
      )}
    </div>
  );
}

/** Top mã lãi/lỗ nhiều nhất toàn thời gian: đã chốt + đang giữ + cổ tức. */
export function TopMovers() {
  const { stats } = useApp();
  const winners = stats.symbolPnl.filter((s) => s.total > 0).slice(0, TOP);
  const losers = stats.symbolPnl
    .filter((s) => s.total < 0)
    .slice(-TOP)
    .reverse();
  const max = Math.max(0, ...[...winners, ...losers].map((s) => Math.abs(s.total)));

  if (stats.symbolPnl.length === 0) return null;

  return (
    <section className="app-card" aria-labelledby="top-movers-title">
      <h2 id="top-movers-title" className="app-card-section-title mb-1">
        Lãi/lỗ theo mã (toàn thời gian)
      </h2>
      <p className="mb-3 text-xs text-app-muted">
        Đã chốt + đang giữ + cổ tức; % tính trên tổng tiền đã mua mã đó.
        {/* Tooltip `title` chỉ có trên máy dùng chuột. */}
        <span className="hidden [@media(hover:hover)]:inline"> Rê chuột để xem chi tiết.</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoverList title="Top 5 lãi nhất" items={winners} max={max} empty="Chưa có mã nào lãi." />
        <MoverList title="Top 5 lỗ nhất" items={losers} max={max} empty="Không có mã nào lỗ." />
      </div>
    </section>
  );
}
