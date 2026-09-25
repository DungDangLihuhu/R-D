"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { formatShares, formatSplitRatio } from "@/lib/format";
import { toast } from "@/lib/toast-store";
import { toYahooSymbol } from "@/lib/symbol";
import { heldQuantityAt } from "@/lib/trade-display";
import type { AssetType, Transaction, TransactionType } from "@/lib/types";

const types: { value: TransactionType; label: string }[] = [
  { value: "BUY", label: "Mua" },
  { value: "SELL", label: "Bán" },
  { value: "DIVIDEND", label: "Cổ tức" },
  { value: "DEPOSIT", label: "Nạp tiền" },
  { value: "WITHDRAW", label: "Rút tiền" },
  { value: "SPLIT", label: "Chia tách (split)" },
];

const assetTypes: { value: AssetType; label: string }[] = [
  { value: "STOCK", label: "Cổ phiếu" },
  { value: "ETF", label: "ETF" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "FOREX", label: "Forex" },
  { value: "OTHER", label: "Khác" },
];

export function TradeForm({
  onSaved,
  initial,
  onCancel,
}: {
  onSaved?: () => void;
  /** Có thì form sửa lệnh này (giữ id) thay vì thêm lệnh mới. Giá theo tiền niêm yết. */
  initial?: Transaction;
  onCancel?: () => void;
}) {
  const { state, activePortfolioId, addTransaction, updateTransaction, currencyOf } = useApp();
  const editingSplit = initial?.type === "SPLIT";
  const [type, setType] = useState<TransactionType>(initial?.type ?? "BUY");
  const [symbol, setSymbol] = useState(
    initial && initial.symbol !== "CASH" ? initial.symbol : ""
  );
  const [exchange, setExchange] = useState("");
  const [assetType, setAssetType] = useState<AssetType>(initial?.assetType ?? "STOCK");
  const [quantity, setQuantity] = useState(
    initial && !editingSplit ? String(initial.quantity) : ""
  );
  const [price, setPrice] = useState(initial && !editingSplit ? String(initial.price) : "");
  const [fee, setFee] = useState(initial ? String(initial.fee) : "0");
  const [date, setDate] = useState(
    initial ? initial.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [splitNew, setSplitNew] = useState(editingSplit ? String(initial.quantity) : "");
  const [splitOld, setSplitOld] = useState("1");

  // Sửa lệnh: giữ giờ gốc nếu không đổi ngày, để thứ tự các lệnh cùng ngày không xáo trộn.
  const isoDate = () =>
    initial && initial.date.slice(0, 10) === date ? initial.date : new Date(date).toISOString();
  const save = (tx: Omit<Transaction, "id">) => {
    if (initial) updateTransaction(initial.id, { ...tx, portfolioId: initial.portfolioId });
    else addTransaction(tx);
  };
  // Lệnh đang sửa không tính vào số cổ phiếu đang giữ khi cảnh báo bán vượt.
  const otherTransactions = useMemo(
    () => (initial ? state.transactions.filter((t) => t.id !== initial.id) : state.transactions),
    [initial, state.transactions]
  );

  const isCash = type === "DEPOSIT" || type === "WITHDRAW";
  const isSplit = type === "SPLIT";

  // Cảnh báo (không chặn): bán vượt số đang giữ làm giá vốn phần vượt thành ước đoán.
  const resolvedSymbol = symbol.trim() ? toYahooSymbol(symbol, exchange || undefined) : "";
  const heldForSell = useMemo(
    () =>
      (type === "SELL" || type === "SPLIT") && resolvedSymbol
        ? heldQuantityAt(otherTransactions, activePortfolioId, resolvedSymbol, date)
        : null,
    [type, resolvedSymbol, otherTransactions, activePortfolioId, date]
  );
  const sellQuantity = parseFloat(quantity);
  const oversold =
    type === "SELL" &&
    heldForSell != null &&
    Number.isFinite(sellQuantity) &&
    sellQuantity > heldForSell + 1e-9;
  const splitHasNoPosition = isSplit && heldForSell === 0;

  // Giá nhập theo tiền niêm yết của sàn (EUR với .PA…); app tự quy ra USD theo tỷ giá ngày khớp.
  const listedCurrency = resolvedSymbol ? currencyOf(resolvedSymbol) : "USD";
  const foreignListing =
    !isCash && resolvedSymbol !== "" && (listedCurrency !== "USD" || resolvedSymbol.includes("."));
  const priceLabel = isCash
    ? "Tỷ giá (1)"
    : listedCurrency !== "USD"
      ? `Giá (${listedCurrency})`
      : foreignListing
        ? "Giá (theo tiền của sàn)"
        : "Giá";

  const resetFields = () => {
    setSymbol("");
    setExchange("");
    setQuantity("");
    setPrice("");
    setFee("0");
    setNotes("");
    setSplitNew("");
    setSplitOld("1");
  };

  const submitSplit = () => {
    const ratio = parseFloat(splitNew) / parseFloat(splitOld);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio === 1) {
      toast.error("Nhập tỷ lệ split hợp lệ, ví dụ 10 : 1");
      return;
    }
    save({
      portfolioId: activePortfolioId,
      type: "SPLIT",
      symbol: resolvedSymbol,
      assetType,
      quantity: ratio,
      price: 0,
      fee: 0,
      date: isoDate(),
      notes: notes || undefined,
    });
    toast.success(
      `${initial ? "Đã cập nhật" : "Đã lưu"} split ${resolvedSymbol} ${formatSplitRatio(ratio)}`
    );
    resetFields();
    onSaved?.();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSplit) {
      submitSplit();
      return;
    }
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    const f = parseFloat(fee) || 0;
    if (isNaN(q) || q <= 0 || isNaN(p) || p <= 0) {
      toast.error("Nhập số lượng và giá hợp lệ");
      return;
    }
    save({
      portfolioId: activePortfolioId,
      type,
      symbol: isCash ? "CASH" : toYahooSymbol(symbol, exchange || undefined),
      assetType: isCash ? "OTHER" : assetType,
      quantity: q,
      price: p,
      fee: f,
      date: isoDate(),
      notes: notes || undefined,
    });
    const label = types.find((t) => t.value === type)?.label ?? type;
    toast.success(
      `${initial ? "Đã cập nhật" : "Đã lưu"} giao dịch ${label}${
        isCash ? "" : ` ${toYahooSymbol(symbol, exchange || undefined)}`
      }`
    );
    resetFields();
    onSaved?.();
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 app-card p-5"
    >
      <h2 className="text-lg font-semibold">{initial ? "Sửa giao dịch" : "Thêm giao dịch"}</h2>
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
            {!isSplit && (
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
            )}
          </>
        )}
        {isSplit ? (
          <div className="block text-sm">
            <span className="app-label">Tỷ lệ (mới : cũ)</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                step="any"
                min="0"
                value={splitNew}
                onChange={(e) => setSplitNew(e.target.value)}
                aria-label="Số cổ phiếu mới"
                placeholder="10"
                className="app-input w-full"
                required
              />
              <span className="text-app-muted">:</span>
              <input
                type="number"
                step="any"
                min="0"
                value={splitOld}
                onChange={(e) => setSplitOld(e.target.value)}
                aria-label="Số cổ phiếu cũ"
                className="app-input w-full"
                required
              />
            </div>
            <span className="mt-1 block text-xs text-gray-400">
              NVDA 10/06/2024 là 10 : 1; gộp cổ phiếu 1 đổi 10 thì nhập 1 : 10. Số cổ đang giữ
              nhân theo tỷ lệ, tổng giá vốn giữ nguyên.
            </span>
            {splitHasNoPosition && (
              <span className="mt-1 block text-xs text-amber-700">
                Tới ngày này chưa giữ {resolvedSymbol} — lệnh split sẽ không đổi gì.
              </span>
            )}
          </div>
        ) : (
          <>
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
              {oversold && (
                <span className="mt-1 block text-xs text-amber-700">
                  Tới ngày này chỉ đang giữ {formatShares(heldForSell ?? 0)} {resolvedSymbol} — bán{" "}
                  {formatShares(sellQuantity)} sẽ vượt số đang giữ.
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="app-label">{priceLabel}</span>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full app-input"
                required
              />
              {foreignListing && (
                <span className="mt-1 block text-xs text-gray-400">
                  Quy ra USD theo tỷ giá ngày khớp.
                </span>
              )}
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
          </>
        )}
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
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="app-btn-primary">
          {initial ? "Lưu thay đổi" : "Lưu giao dịch"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="app-btn-secondary">
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}
