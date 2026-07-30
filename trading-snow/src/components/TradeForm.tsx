"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import type { AssetType, TransactionType } from "@/lib/types";

const types: { value: TransactionType; label: string }[] = [
  { value: "BUY", label: "Mua" },
  { value: "SELL", label: "Bán" },
  { value: "DIVIDEND", label: "Cổ tức" },
  { value: "DEPOSIT", label: "Nạp tiền" },
  { value: "WITHDRAW", label: "Rút tiền" },
];

const assetTypes: { value: AssetType; label: string }[] = [
  { value: "STOCK", label: "Cổ phiếu" },
  { value: "ETF", label: "ETF" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "FOREX", label: "Forex" },
  { value: "OTHER", label: "Khác" },
];

export function TradeForm() {
  const { activePortfolioId, addTransaction } = useApp();
  const [type, setType] = useState<TransactionType>("BUY");
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("STOCK");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");

  const isCash = type === "DEPOSIT" || type === "WITHDRAW";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    const f = parseFloat(fee) || 0;
    if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) {
      setMsg("Nhập số lượng và giá hợp lệ");
      return;
    }
    addTransaction({
      portfolioId: activePortfolioId,
      type,
      symbol: isCash ? "CASH" : symbol.toUpperCase(),
      assetType: isCash ? "OTHER" : assetType,
      quantity: q,
      price: p,
      fee: f,
      date: new Date(date).toISOString(),
      notes: notes || undefined,
    });
    setMsg("Đã lưu giao dịch");
    setSymbol("");
    setQuantity("");
    setPrice("");
    setFee("0");
    setNotes("");
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
    >
      <h2 className="text-lg font-semibold">Thêm giao dịch</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-zinc-400">Loại</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {!isCash && (
          <>
            <label className="block text-sm">
              <span className="text-zinc-400">Mã</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AAPL, MU, BTC..."
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 uppercase"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-zinc-400">Loại tài sản</span>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {assetTypes.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="block text-sm">
          <span className="text-zinc-400">
            {isCash ? "Số tiền" : "Số lượng"}
          </span>
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">
            {isCash ? "Tỷ giá (1)" : "Giá"}
          </span>
          <input
            type="number"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Phí</span>
          <input
            type="number"
            step="any"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Ngày</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-zinc-400">Ghi chú</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          placeholder="Tùy chọn"
        />
      </label>
      {msg && <p className="text-sm text-sky-400">{msg}</p>}
      <button
        type="submit"
        className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400"
      >
        Lưu giao dịch
      </button>
    </form>
  );
}
