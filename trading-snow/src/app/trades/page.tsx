"use client";

import { useState } from "react";
import { PenLine, Trash2 } from "lucide-react";
import { CsvImport } from "@/components/CsvImport";
import { SmsImport } from "@/components/SmsImport";
import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";
import { useApp } from "@/context/AppContext";

export default function TradesPage() {
  const [showManualForm, setShowManualForm] = useState(false);
  const { state, activePortfolioId, clearPortfolioTransactions } = useApp();

  const portfolioTxCount = state.transactions.filter(
    (t) => t.portfolioId === activePortfolioId
  ).length;

  const handleClearAll = () => {
    if (portfolioTxCount === 0) {
      alert("Không có giao dịch để xóa");
      return;
    }

    const ok = confirm(
      `Xóa TẤT CẢ ${portfolioTxCount} giao dịch trong portfolio này?\n\nHành động không hoàn tác.`
    );
    if (!ok) return;

    clearPortfolioTransactions(activePortfolioId);
    alert("Đã xóa toàn bộ lịch sử giao dịch");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Giao dịch</h1>
          <p className="text-sm text-gray-500">
            Import CSV, tin nhắn ngân hàng hoặc thêm thủ công
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 shadow-sm hover:bg-rose-50"
        >
          <Trash2 className="h-4 w-4" />
          Xóa tất cả giao dịch
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <CsvImport />
        <SmsImport />
        <button
          type="button"
          onClick={() => setShowManualForm((v) => !v)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 ${
            showManualForm
              ? "border-sky-300 bg-sky-50 text-sky-700"
              : "border-gray-200"
          }`}
        >
          <PenLine className="h-4 w-4" />
          Thêm giao dịch thủ công
        </button>
      </div>

      {showManualForm && (
        <TradeForm onSaved={() => setShowManualForm(false)} />
      )}
      <TradeTable />
    </div>
  );
}
