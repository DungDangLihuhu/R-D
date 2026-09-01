"use client";

import { History } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import type { ClosedTrade } from "@/lib/types";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";

export function ClosedTradesTable({
  trades,
  showFooter = true,
}: {
  trades: ClosedTrade[];
  showFooter?: boolean;
}) {
  const { state } = useApp();
  const sorted = [...trades].reverse();
  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(sorted);

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Chưa có lệnh đã đóng"
        description="Lãi/lỗ hiện khi bạn bán cổ phiếu đã mua trước đó."
      />
    );
  }

  const totalPnl = sorted.reduce((s, t) => s + t.pnl, 0);

  return (
    <div className="app-table-wrap">
      <div className="space-y-3 p-3 sm:hidden">
        {pageItems.map((t, i) => {
          const quote = state.marketQuotes?.[t.symbol];
          return (
            <div
              key={`${t.date}-${t.symbol}-${i}`}
              className="rounded-lg border border-gray-200 bg-app-surface p-3 text-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <SymbolIdentity
                  symbol={t.symbol}
                  name={quote?.name}
                  logo={quote?.logo}
                  size="sm"
                  nameClassName="truncate text-sm font-medium text-gray-900"
                />
                <p className="shrink-0 text-xs text-gray-500">{formatDate(t.date)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-gray-500">SL</dt>
                  <dd className="tabular-nums font-medium">
                    {formatNumber(t.quantity, 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Giá vốn</dt>
                  <dd className="tabular-nums font-medium text-gray-600">
                    {formatMoney(t.costBasis)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Tiền về</dt>
                  <dd className="tabular-nums font-medium text-gray-600">
                    {formatMoney(t.proceeds)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">P&L</dt>
                  <dd
                    className={`tabular-nums font-medium ${
                      t.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatMoney(t.pnl)} ({formatPercent(t.pnlPercent)})
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead className="app-table-head text-left">
            <tr>
              <th className="px-4 py-2">Ngày</th>
              <th className="px-4 py-2">Mã</th>
              <th className="px-4 py-2 text-right">SL</th>
              <th className="px-4 py-2 text-right">Giá vốn</th>
              <th className="px-4 py-2 text-right">Tiền về</th>
              <th className="px-4 py-2 text-right">P&L</th>
              <th className="px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((t, i) => {
              const quote = state.marketQuotes?.[t.symbol];
              return (
                <tr
                  key={`${t.date}-${t.symbol}-${i}`}
                  className="app-row border-t border-gray-200"
                >
                  <td className="px-4 py-2">{formatDate(t.date)}</td>
                  <td className="px-4 py-2">
                    <SymbolIdentity
                      symbol={t.symbol}
                      name={quote?.name}
                      logo={quote?.logo}
                      size="sm"
                      nameClassName="truncate text-sm font-medium text-gray-900"
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNumber(t.quantity, 0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                    {formatMoney(t.costBasis)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                    {formatMoney(t.proceeds)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums font-medium ${
                      t.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatMoney(t.pnl)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      t.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {formatPercent(t.pnlPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {showFooter && (
            <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
              <tr>
                <td className="px-4 py-3" colSpan={5}>
                  Tổng ({sorted.length} lệnh)
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {formatMoney(totalPnl)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showFooter && (
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium sm:hidden">
          <div className="flex items-center justify-between">
            <span>Tổng ({sorted.length} lệnh)</span>
            <span
              className={`tabular-nums ${
                totalPnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatMoney(totalPnl)}
            </span>
          </div>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
