"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

export function HoldingsTable() {
  const { stats, setMarketPrice } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  if (stats.holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
        Chưa có vị thế mở. Mua cổ phiếu để thấy danh mục.
      </div>
    );
  }

  const savePrice = (symbol: string) => {
    const p = parseFloat(priceInput);
    if (!isNaN(p) && p > 0) setMarketPrice(symbol, p);
    setEditing(null);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
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
          {stats.holdings.map((h) => {
            const market = h.marketPrice ?? h.avgCost;
            const value = h.quantity * market;
            const unrealized = h.marketPrice
              ? value - h.totalCost
              : 0;
            const pct =
              h.marketPrice && h.totalCost > 0
                ? (unrealized / h.totalCost) * 100
                : 0;

            return (
              <tr key={h.symbol} className="border-t border-zinc-800">
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
                      onKeyDown={(e) => e.key === "Enter" && savePrice(h.symbol)}
                      className="w-24 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-right text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditing(h.symbol);
                        setPriceInput(String(market));
                      }}
                      className="tabular-nums text-sky-400 hover:underline"
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
                    unrealized >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {h.marketPrice ? (
                    <>
                      {formatMoney(unrealized)}
                      <span className="ml-1 text-xs">({formatPercent(pct)})</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
        Giá từ Yahoo Finance. Bấm giá để sửa thủ công nếu cần.
      </p>
    </div>
  );
}
