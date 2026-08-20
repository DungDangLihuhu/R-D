"use client";

import { useState } from "react";
import { PenLine, Trash2 } from "lucide-react";
import { CsvImport } from "@/components/CsvImport";
import { SmsImport } from "@/components/SmsImport";
import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";
import { PageHeader } from "@/components/PageHeader";
import { useApp } from "@/context/AppContext";
import { toast } from "@/lib/toast-store";

export default function TradesPage() {
  const [showManualForm, setShowManualForm] = useState(false);
  const { state, activePortfolioId, clearPortfolioTransactions } = useApp();

  const portfolioTxCount = state.transactions.filter(
    (t) => t.portfolioId === activePortfolioId
  ).length;

  const handleClearAll = () => {
    if (portfolioTxCount === 0) {
      toast.info("Không có giao dịch để xóa");
      return;
    }

    const ok = confirm(
      `Xóa TẤT CẢ ${portfolioTxCount} giao dịch trong portfolio này?\n\nHành động không hoàn tác.`
    );
    if (!ok) return;

    clearPortfolioTransactions(activePortfolioId);
    toast.success(`Đã xóa ${portfolioTxCount} giao dịch`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Giao dịch"
        description="Import CSV, tin nhắn ngân hàng hoặc thêm thủ công"
        actions={
          <button
            type="button"
            onClick={handleClearAll}
            className="app-btn-danger"
          >
            <Trash2 className="h-4 w-4" />
            Xóa tất cả giao dịch
          </button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <CsvImport />
        <SmsImport />
        <button
          type="button"
          onClick={() => setShowManualForm((v) => !v)}
          className={`app-btn-secondary ${
            showManualForm ? "border-sky-300 bg-sky-50 text-sky-700" : ""
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
