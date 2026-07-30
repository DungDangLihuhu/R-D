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
import { useApp } from "@/context/AppContext";
import type { DividendCalendarItem } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { PriceRefresh } from "@/components/PriceRefresh";

export function DividendCalendar() {
  const { state, activePortfolioId, stats } = useApp();
  const [yahooEvents, setYahooEvents] = useState<DividendCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date());

  const symbols = useMemo(
    () => [...new Set(stats.holdings.map((h) => h.symbol))],
    [stats.holdings]
  );

  const recorded: DividendCalendarItem[] = useMemo(() => {
    return state.transactions
      .filter(
        (t) =>
          t.portfolioId === activePortfolioId && t.type === "DIVIDEND"
      )
      .map((t) => ({
        symbol: t.symbol,
        date: t.date,
        amount: t.price,
        source: "recorded" as const,
        quantity: t.quantity,
        total: t.quantity * t.price,
      }));
  }, [state.transactions, activePortfolioId]);

  useEffect(() => {
    if (symbols.length === 0) {
      setYahooEvents([]);
      return;
    }
    setLoading(true);
    fetch(`/api/dividends?symbols=${symbols.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        const now = new Date();
        const qtyMap = new Map(
          stats.holdings.map((h) => [h.symbol, h.quantity])
        );
        const items: DividendCalendarItem[] = (data.events ?? [])
          .filter((e: { date: string }) => isAfter(new Date(e.date), now))
          .map(
            (e: { symbol: string; date: string; amount: number }) => {
              const qty = qtyMap.get(e.symbol) ?? 0;
              return {
                symbol: e.symbol,
                date: e.date,
                amount: e.amount,
                source: "yahoo" as const,
                quantity: qty,
                total: qty * e.amount,
              };
            }
          );
        setYahooEvents(items);
      })
      .finally(() => setLoading(false));
  }, [symbols.join(","), stats.holdings]);

  const all = useMemo(() => {
    return [...recorded, ...yahooEvents].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [recorded, yahooEvents]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const inMonth = all.filter((d) => {
    const dt = new Date(d.date);
    return !isBefore(dt, monthStart) && !isAfter(dt, monthEnd);
  });

  const yearTotal = recorded.reduce((s, d) => s + (d.total ?? 0), 0);
  const upcomingTotal = yahooEvents.reduce((s, d) => s + (d.total ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lịch cổ tức</h1>
          <p className="text-sm text-zinc-500">
            Đã nhận từ giao dịch + dự kiến từ Yahoo Finance
          </p>
        </div>
        <PriceRefresh />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Mini label="Cổ tức đã ghi (tất cả)" value={formatMoney(yearTotal)} />
        <Mini
          label="Dự kiến sắp tới"
          value={loading ? "..." : formatMoney(upcomingTotal)}
        />
        <Mini label="Sự kiện tháng này" value={String(inMonth.length)} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setMonth(subMonths(month, 1))}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
        >
          ←
        </button>
        <span className="min-w-32 text-center font-medium capitalize">
          {format(month, "MMMM yyyy", { locale: vi })}
        </span>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-900"
        >
          →
        </button>
      </div>

      {inMonth.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
          Không có cổ tức trong tháng này
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3 text-right">$/cp</th>
                <th className="px-4 py-3 text-right">SL giữ</th>
                <th className="px-4 py-3 text-right">Tổng</th>
                <th className="px-4 py-3">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {inMonth.map((d, i) => (
                <tr key={i} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{formatDate(d.date)}</td>
                  <td className="px-4 py-3 font-medium">{d.symbol}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(d.amount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {d.quantity?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-400">
                    {d.total ? formatMoney(d.total) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        d.source === "recorded"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-sky-500/15 text-sky-400"
                      }`}
                    >
                      {d.source === "recorded" ? "Đã nhận" : "Dự kiến"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
