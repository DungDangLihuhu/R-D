"use client";

import { useState } from "react";
import { Pagination } from "@/components/Pagination";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

export function HoldingsTable() {
  const { stats, setMarketPrice } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(stats.holdings);

  if (stats.holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
        Chưa có vị thế mở. Mua cổ phiếu để thấy danh mục.
      </div>
    );
  }

  const savePrice = (symbol: string) => {
    const p = parseFloat(priceInput);
    if (!isNaN(p) && p > 0) setMarketPrice(symbol, p);
    setEditing(null);
  };

  const renderRow = (h: (typeof stats.holdings)[number]) => {
    const market = h.marketPrice ?? h.avgCost;
    const value = h.quantity * market;
    const unrealized = h.marketPrice ? value - h.totalCost : 0;
    const pct =
      h.marketPrice && h.totalCost > 0 ? (unrealized / h.totalCost) * 100 : 0;

    return { h, market, value, unrealized, pct };
  };

  return (
    <div className="rounded-xl border border-gray-200">
      <div className="space-y-3 p-3 sm:hidden">
        {pageItems.map((h) => {
          const { market, value, unrealized, pct } = renderRow(h);
          return (
            <div
              key={h.symbol}
              className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
            >
              <p className="mb-2 font-medium">{h.symbol}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-gray-500">SL</dt>
                  <dd className="tabular-nums font-medium">
                    {formatNumber(h.quantity, 4)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Giá vốn TB</dt>
                  <dd className="tabular-nums font-medium">
                    {formatMoney(h.avgCost)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Giá TT</dt>
                  <dd>
                    {editing === h.symbol ? (
                      <input
                        autoFocus
                        type="number"
                        step="any"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onBlur={() => savePrice(h.symbol)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && savePrice(h.symbol)
                        }
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(h.symbol);
                          setPriceInput(String(market));
                        }}
                        className="tabular-nums font-medium text-sky-600 hover:underline"
                      >
                        {formatMoney(market)}
                      </button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Giá trị</dt>
                  <dd className="tabular-nums font-medium">
                    {formatMoney(value)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Lãi/lỗ chưa chốt</dt>
                  <dd
                    className={`tabular-nums font-medium ${
                      unrealized >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {h.marketPrice ? (
                      <>
                        {formatMoney(unrealized)} ({formatPercent(pct)})
                      </>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3 text-right">SL</th>
              <th className="px-4 py-3 text-right">Giá vốn TB</th>
              <th className="px-4 py-3 text-right">Giá TT</th>
              <th className="px-4 py-3 text-right">Giá trị</th>
              <th className="px-4 py-3 text-right">Lãi/lỗ chưa chốt</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((h) => {
              const { market, value, unrealized, pct } = renderRow(h);
              return (
                <tr key={h.symbol} className="border-t border-gray-200">
                  <td className="px-4 py-3 font-medium">{h.symbol}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(h.quantity, 4)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(h.avgCost)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editing === h.symbol ? (
                      <input
                        autoFocus
                        type="number"
                        step="any"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        onBlur={() => savePrice(h.symbol)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && savePrice(h.symbol)
                        }
                        className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(h.symbol);
                          setPriceInput(String(market));
                        }}
                        className="tabular-nums text-sky-600 hover:underline"
                      >
                        {formatMoney(market)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(value)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      unrealized >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {h.marketPrice ? (
                      <>
                        {formatMoney(unrealized)}
                        <span className="ml-1 text-xs">
                          ({formatPercent(pct)})
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        Giá từ Yahoo Finance. Bấm giá để sửa thủ công nếu cần.
      </p>

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
