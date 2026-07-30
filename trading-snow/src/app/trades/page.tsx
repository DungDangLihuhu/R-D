"use client";

import { CsvImport } from "@/components/CsvImport";
import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Giao dịch</h1>
        <p className="text-sm text-zinc-500">
          Nhập thủ công hoặc import CSV từ broker
        </p>
      </div>
      <CsvImport />
      <TradeForm />
      <TradeTable />
    </div>
  );
}
