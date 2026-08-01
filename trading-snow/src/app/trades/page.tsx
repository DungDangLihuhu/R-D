"use client";

import { CsvImport } from "@/components/CsvImport";
import { SmsImport } from "@/components/SmsImport";
import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Giao dịch</h1>
        <p className="text-sm text-gray-500">
          Nhập thủ công, import CSV hoặc dán tin nhắn ngân hàng
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <CsvImport />
        <SmsImport />
      </div>
      <TradeForm />
      <TradeTable />
    </div>
  );
}
