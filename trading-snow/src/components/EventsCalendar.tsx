"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfMonth,
  subMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import { ExternalLink } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { PageHeader } from "@/components/PageHeader";
import { PriceRefresh } from "@/components/PriceRefresh";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import { formatDate, formatMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-cache";
import type { CalendarEvent, EventCategory } from "@/lib/types";

const TABS: { id: EventCategory | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "dividend", label: "Cổ tức" },
  { id: "earnings", label: "Báo cáo (ER)" },
  { id: "news", label: "Tin tức" },
  { id: "macro", label: "Vĩ mô" },
  { id: "holiday", label: "Nghỉ lễ Mỹ" },
];

const CATEGORY_STYLE: Record<
  EventCategory,
  { badge: string; label: string }
> = {
  dividend: { badge: "bg-emerald-500/15 text-emerald-700", label: "Cổ tức" },
  earnings: { badge: "bg-violet-500/15 text-violet-700", label: "Báo cáo" },
  news: { badge: "bg-sky-500/15 text-sky-700", label: "Tin tức" },
  macro: { badge: "bg-amber-500/15 text-amber-800", label: "Vĩ mô" },
  holiday: { badge: "bg-rose-500/15 text-rose-700", label: "Nghỉ lễ" },
};

export function EventsCalendar() {
  const { state, activePortfolioId, stats, isSymbolHidden } = useApp();
  const [apiEvents, setApiEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(new Date());
  const [tab, setTab] = useState<EventCategory | "all">("all");

  const symbols = useMemo(
    () => [...new Set(stats.holdings.map((h) => h.symbol))],
    [stats.holdings]
  );

  const qtyMap = useMemo(
    () => new Map(stats.holdings.map((h) => [h.symbol, h.quantity])),
    [stats.holdings]
  );

  const recordedDividends: CalendarEvent[] = useMemo(() => {
    return state.transactions
      .filter(
        (t) =>
          t.portfolioId === activePortfolioId &&
          t.type === "DIVIDEND" &&
          !isSymbolHidden(t.symbol)
      )
      .map((t) => ({
        id: `rec-${t.id}`,
        date: t.date,
        title: "Cổ tức đã nhận",
        category: "dividend" as const,
        symbol: t.symbol,
        amount: t.price,
        subtitle: `${t.quantity} cp · ${formatMoney(t.quantity * t.price)}`,
        impact: "low" as const,
      }));
  }, [state.transactions, activePortfolioId, isSymbolHidden]);

  const fetchFrom = format(subMonths(startOfMonth(month), 1), "yyyy-MM-dd");
  const fetchTo = format(addMonths(endOfMonth(month), 3), "yyyy-MM-dd");
  const macroFrom = format(startOfMonth(month), "yyyy-MM-dd");
  const macroTo = format(endOfMonth(month), "yyyy-MM-dd");

  const symbolKey = symbols.join(",");

  useEffect(() => {
    let cancelled = false;
    const startFetch = () => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    };
    const tid = globalThis.setTimeout(startFetch, 0);

    const params = new URLSearchParams({
      from: fetchFrom,
      to: fetchTo,
      macroFrom,
      macroTo,
    });
    if (symbolKey) params.set("symbols", symbolKey);

    fetchJson<{ events?: CalendarEvent[]; error?: string }>(
      `/api/events?${params.toString()}`,
      { ttlMs: 5 * 60 * 1000 }
    )
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setApiEvents([]);
          return;
        }
        setApiEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Không tải được lịch sự kiện");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      globalThis.clearTimeout(tid);
    };
  }, [symbolKey, fetchFrom, fetchTo, macroFrom, macroTo]);

  const effectiveApiEvents = apiEvents;

  const all = useMemo(() => {
    const ids = new Set<string>();
    const merged: CalendarEvent[] = [];
    for (const e of [...recordedDividends, ...effectiveApiEvents]) {
      if (ids.has(e.id)) continue;
      ids.add(e.id);
      merged.push(e);
    }
    return merged.sort((a, b) => a.date.localeCompare(b.date));
  }, [recordedDividends, effectiveApiEvents]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const inMonth = all.filter((e) => {
    const dt = new Date(e.date);
    if (tab !== "all" && e.category !== tab) return false;
    return !isBefore(dt, monthStart) && !isAfter(dt, monthEnd);
  });

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(inMonth, [format(month, "yyyy-MM"), tab]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const e of all) {
      const dt = new Date(e.date);
      if (isBefore(dt, monthStart) || isAfter(dt, monthEnd)) continue;
      c.all = (c.all ?? 0) + 1;
      c[e.category] = (c[e.category] ?? 0) + 1;
    }
    return c;
  }, [all, monthStart, monthEnd]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sự kiện"
        description="Cổ tức · báo cáo tài chính · tin tức mã trong danh mục · vĩ mô USD · nghỉ lễ NYSE/Nasdaq"
        actions={<PriceRefresh />}
      />

      {symbols.length === 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Chưa có mã trong danh mục — vẫn hiển thị{" "}
          <strong>nghỉ lễ Mỹ</strong> và <strong>vĩ mô USD</strong>. Thêm giao
          dịch để xem cổ tức, báo cáo và tin theo holdings.
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-sky-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
            {counts[t.id] != null && counts[t.id] > 0 ? ` (${counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMonth(subMonths(month, 1))}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ←
        </button>
        <span className="min-w-32 text-center font-medium capitalize">
          {format(month, "MMMM yyyy", { locale: vi })}
        </span>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          →
        </button>
        {loading && (
          <span className="text-sm text-gray-500">Đang tải...</span>
        )}
      </div>

      {error && (
        <p className="text-sm text-rose-600">{error}</p>
      )}

      {inMonth.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
          {loading
            ? "Đang tải sự kiện..."
            : tab === "holiday"
              ? "Không có nghỉ lễ NYSE/Nasdaq trong tháng này"
              : "Không có sự kiện trong tháng này cho bộ lọc đã chọn"}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200">
          <div className="space-y-3 p-3 sm:hidden">
            {pageItems.map((e) => (
              <EventCard key={e.id} event={e} qtyMap={qtyMap} />
            ))}
          </div>

          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3">Ngày</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Mã / Sự kiện</th>
                  <th className="px-4 py-3">Chi tiết</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e) => (
                  <tr key={e.id} className="border-t border-gray-200">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={e.category} />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {e.symbol ?? "—"}
                      <div className="font-normal text-gray-700">{e.title}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <EventDetail event={e} qtyMap={qtyMap} />
                    </td>
                    <td className="px-4 py-3">
                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-600 hover:text-sky-800"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: EventCategory }) {
  const style = CATEGORY_STYLE[category];
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs ${style.badge}`}>
      {style.label}
    </span>
  );
}

function EventDetail({
  event,
  qtyMap,
}: {
  event: CalendarEvent;
  qtyMap: Map<string, number>;
}) {
  if (event.subtitle) return <span>{event.subtitle}</span>;
  if (event.category === "dividend" && event.amount && event.symbol) {
    const qty = qtyMap.get(event.symbol) ?? 0;
    return (
      <span>
        {formatMoney(event.amount)}/cp
        {qty > 0 ? ` · ~${formatMoney(qty * event.amount)}` : ""}
      </span>
    );
  }
  return <span>—</span>;
}

function EventCard({
  event,
  qtyMap,
}: {
  event: CalendarEvent;
  qtyMap: Map<string, number>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{event.symbol ?? event.title}</p>
          {event.symbol && (
            <p className="text-gray-700">{event.title}</p>
          )}
        </div>
        <CategoryBadge category={event.category} />
      </div>
      <p className="mb-2 text-xs text-gray-500">{formatDate(event.date)}</p>
      <p className="text-gray-600">
        <EventDetail event={event} qtyMap={qtyMap} />
      </p>
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-sky-600"
        >
          Đọc thêm <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
