"use client";

import { Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const typeLabels: Record<string, string> = {
  BUY: "Mua",
  SELL: "Bán",
  DIVIDEND: "Cổ tức",
  DEPOSIT: "Nạp",
  WITHDRAW: "Rút",
};

export function TradeTable() {
  const { state, activePortfolioId, deleteTransaction } = useApp();
  const trades = state.transactions
    .filter((t) => t.portfolioId === activePortfolioId)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
        Chưa có giao dịch. Thêm giao dịch đầu tiên ở form bên trên.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-4 py-3">Ngày</th>
            <th className="px-4 py-3">Loại</th>
            <th className="px-4 py-3">Mã</th>
            <th className="px-4 py-3 text-right">SL</th>
            <th className="px-4 py-3 text-right">Giá</th>
            <th className="px-4 py-3 text-right">Giá trị</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="border-t border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3">{formatDate(t.date)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.type === "BUY"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : t.type === "SELL"
                        ? "bg-rose-500/15 text-rose-600"
                        : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {typeLabels[t.type]}
                </span>
              </td>
              <td className="px-4 py-3 font-medium">{t.symbol}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatNumber(t.quantity, 4)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(t.price)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(t.quantity * t.price)}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => deleteTransaction(t.id)}
                  className="text-gray-500 hover:text-rose-600"
                  aria-label="Xóa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
