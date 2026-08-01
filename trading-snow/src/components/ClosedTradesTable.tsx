"use client";

import type { ClosedTrade } from "@/lib/types";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";

export function ClosedTradesTable({
  trades,
  showFooter = true,
}: {
  trades: ClosedTrade[];
  showFooter?: boolean;
}) {
  const sorted = [...trades].reverse();

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
        Chưa có lệnh đã đóng. Lãi/lỗ hiện khi bạn bán cổ phiếu đã mua trước đó.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
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
          {sorted.map((t, i) => (
            <tr key={`${t.date}-${t.symbol}-${i}`} className="border-t border-gray-200">
              <td className="px-4 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
              <td className="px-4 py-2 font-medium">{t.symbol}</td>
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
          ))}
        </tbody>
        {showFooter && (
          <tfoot className="border-t border-gray-200 bg-gray-50 font-medium">
            <tr>
              <td className="px-4 py-3" colSpan={5}>
                Tổng ({sorted.length} lệnh)
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  sorted.reduce((s, t) => s + t.pnl, 0) >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatMoney(sorted.reduce((s, t) => s + t.pnl, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}