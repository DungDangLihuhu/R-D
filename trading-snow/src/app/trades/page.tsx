"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { CsvImport } from "@/components/CsvImport";
import { SmsImport } from "@/components/SmsImport";
import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";

export default function TradesPage() {
  const [showManualForm, setShowManualForm] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Giao dịch</h1>
        <p className="text-sm text-gray-500">
          Import CSV, tin nhắn ngân hàng hoặc thêm thủ công
        </p>
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
