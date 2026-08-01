"use client";

import { Trash2 } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

const typeLabels: Record<string, string> = {
  BUY: "Mua",
  SELL: "Bán",
  DIVIDEND: "Cổ tức",
  DEPOSIT: "Nạp",
  WITHDRAW: "Rút",
};

function typeBadgeClass(type: string) {
  if (type === "BUY") return "bg-emerald-500/15 text-emerald-600";
  if (type === "SELL") return "bg-rose-500/15 text-rose-600";
  return "bg-gray-200 text-gray-700";
}

export function TradeTable() {
  const { state, activePortfolioId, deleteTransaction } = useApp();
  const trades = state.transactions
    .filter((t) => t.portfolioId === activePortfolioId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(trades);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
        Chưa có giao dịch. Thêm giao dịch đầu tiên ở form bên trên.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="space-y-3 p-3 sm:hidden">
        {pageItems.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{t.symbol}</p>
                <p className="text-xs text-gray-500">{formatDate(t.date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${typeBadgeClass(t.type)}`}
                >
                  {typeLabels[t.type]}
                </span>
                <button
                  onClick={() => deleteTransaction(t.id)}
                  className="text-gray-500 hover:text-rose-600"
                  aria-label="Xóa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-gray-500">SL</dt>
                <dd className="tabular-nums font-medium">
                  {formatNumber(t.quantity, 4)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Giá</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoney(t.price)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Giá trị</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoney(t.quantity * t.price)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <div className="hidden sm:block">
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
            {pageItems.map((t) => (
              <tr
                key={t.id}
                className="border-t border-gray-200 hover:bg-gray-50"
              >
                <td className="px-4 py-3">{formatDate(t.date)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${typeBadgeClass(t.type)}`}
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
