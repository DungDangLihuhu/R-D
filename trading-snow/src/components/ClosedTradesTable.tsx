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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-500">
        Chưa có lệnh đã đóng. Lãi/lỗ hiện khi bạn bán cổ phiếu đã mua trước đó.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
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
            <tr key={`${t.date}-${t.symbol}-${i}`} className="border-t border-zinc-800">
              <td className="px-4 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
              <td className="px-4 py-2 font-medium">{t.symbol}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatNumber(t.quantity, 0)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                {formatMoney(t.costBasis)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
                {formatMoney(t.proceeds)}
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums font-medium ${
                  t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatMoney(t.pnl)}
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${
                  t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPercent(t.pnlPercent)}
              </td>
            </tr>
          ))}
        </tbody>
        {showFooter && (
          <tfoot className="border-t border-zinc-700 bg-zinc-900/80 font-medium">
            <tr>
              <td className="px-4 py-3" colSpan={5}>
                Tổng ({sorted.length} lệnh)
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  sorted.reduce((s, t) => s + t.pnl, 0) >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
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