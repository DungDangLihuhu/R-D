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
      <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
        Chưa có giao dịch. Thêm giao dịch đầu tiên ở form bên trên.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
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
            <tr key={t.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
              <td className="px-4 py-3">{formatDate(t.date)}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    t.type === "BUY"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : t.type === "SELL"
                        ? "bg-rose-500/15 text-rose-400"
                        : "bg-zinc-700 text-zinc-300"
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
                  className="text-zinc-500 hover:text-rose-400"
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
