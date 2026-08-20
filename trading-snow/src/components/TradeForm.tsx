"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { toast } from "@/lib/toast-store";
import { toYahooSymbol } from "@/lib/symbol";
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

export function TradeForm({ onSaved }: { onSaved?: () => void }) {
  const { activePortfolioId, addTransaction } = useApp();
  const [type, setType] = useState<TransactionType>("BUY");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("STOCK");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const isCash = type === "DEPOSIT" || type === "WITHDRAW";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    const f = parseFloat(fee) || 0;
    if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) {
      toast.error("Nhập số lượng và giá hợp lệ");
      return;
    }
    addTransaction({
      portfolioId: activePortfolioId,
      type,
      symbol: isCash ? "CASH" : toYahooSymbol(symbol, exchange || undefined),
      assetType: isCash ? "OTHER" : assetType,
      quantity: q,
      price: p,
      fee: f,
      date: new Date(date).toISOString(),
      notes: notes || undefined,
    });
    const label = types.find((t) => t.value === type)?.label ?? type;
    toast.success(`Đã lưu giao dịch ${label}${isCash ? "" : ` ${toYahooSymbol(symbol, exchange || undefined)}`}`);
    setSymbol("");
    setExchange("");
    setQuantity("");
    setPrice("");
    setFee("0");
    setNotes("");
    onSaved?.();
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 app-card p-5"
    >
      <h2 className="text-lg font-semibold">Thêm giao dịch</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="app-label">Loại</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="mt-1 w-full app-input"
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
              <span className="app-label">Mã</span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="SAN, AAPL, MC..."
                className="mt-1 w-full app-input uppercase"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="app-label">Sàn / quốc gia (tùy chọn)</span>
              <input
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                placeholder="PA, L, France, NMS..."
                className="mt-1 w-full app-input uppercase"
              />
              <span className="mt-1 block text-xs text-gray-400">
                VD: SAN + PA → SAN.PA (Sanofi Paris)
              </span>
            </label>
            <label className="block text-sm">
              <span className="app-label">Loại tài sản</span>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as AssetType)}
                className="mt-1 w-full app-input"
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
          <span className="app-label">
            {isCash ? "Số tiền" : "Số lượng"}
          </span>
          <input
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 w-full app-input"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="app-label">
            {isCash ? "Tỷ giá (1)" : "Giá"}
          </span>
          <input
            type="number"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full app-input"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="app-label">Phí</span>
          <input
            type="number"
            step="any"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="mt-1 w-full app-input"
          />
        </label>
        <label className="block text-sm">
          <span className="app-label">Ngày</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full app-input"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="app-label">Ghi chú</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 w-full app-input"
          placeholder="Tùy chọn"
        />
      </label>
      <button
        type="submit"
        className="app-btn-primary"
      >
        Lưu giao dịch
      </button>
    </form>
  );
}
