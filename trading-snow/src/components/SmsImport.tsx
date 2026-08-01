"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  parseBankSms,
  smsTradesToTransactions,
  type ParsedSmsTrade,
} from "@/lib/sms-import";
import { formatMoney } from "@/lib/format";

const EXAMPLE = `StanChart: Order filled:  Sell   600  shares of  MSFT   MICROSOFT ORD  on  NMS  at  USD 450.35. Total Filled Qty:  600, O/S Qty:  0, Avg. Filled Price:  450.4015. Ref.  OSCBF7U41696860`;

export function SmsImport() {
  const { activePortfolioId, addTransaction, setMarketPrice } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedSmsTrade[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleParse = () => {
    const result = parseBankSms(text);
    setPreview(result.trades);
    setErrors(result.errors);
  };

  const confirmImport = () => {
    if (!preview || preview.length === 0) return;

    const txs = smsTradesToTransactions(preview, activePortfolioId);
    for (const tx of txs) {
      addTransaction(tx);
      if (tx.symbol !== "CASH") {
        setMarketPrice(tx.symbol, tx.price);
      }
    }

    setPreview(null);
    setErrors([]);
    setText("");
    setOpen(false);
    alert(`Đã thêm ${txs.length} giao dịch từ SMS`);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
      >
        <MessageSquareText className="h-4 w-4" />
        Import tin nhắn ngân hàng
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import tin nhắn giao dịch</h2>
        <button
          onClick={() => {
            setOpen(false);
            setPreview(null);
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Đóng
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Dán SMS từ ngân hàng/broker. Hiện hỗ trợ <strong>StanChart</strong>{" "}
        (Order filled Buy/Sell). Có thể dán nhiều tin, mỗi dòng một tin.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        rows={5}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleParse}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-sky-400"
        >
          Phân tích tin nhắn
        </button>
        <button
          type="button"
          onClick={() => setText(EXAMPLE)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-200"
        >
          Dán ví dụ
        </button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Cảnh báo ({errors.length})</p>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <>
          <div className="overflow-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Broker</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2 text-left">Mã</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Giá</th>
                  <th className="px-3 py-2 text-left">Ref</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-3 py-1.5">{t.broker}</td>
                    <td className="px-3 py-1.5 text-center">{t.type}</td>
                    <td className="px-3 py-1.5">{t.symbol}</td>
                    <td className="px-3 py-1.5 text-right">{t.quantity}</td>
                    <td className="px-3 py-1.5 text-right">
                      {formatMoney(t.price)}
                    </td>
                    <td className="px-3 py-1.5 text-zlate-500">{t.ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={confirmImport}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            Xác nhận thêm {preview.length} giao dịch
          </button>
        </>
      )}
    </div>
  );
}
