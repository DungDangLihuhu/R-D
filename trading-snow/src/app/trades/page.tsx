"use client";

import { TradeForm } from "@/components/TradeForm";
import { TradeTable } from "@/components/TradeTable";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Giao dịch</h1>
        <p className="text-sm text-zinc-500">
          Nhập mua/bán, cổ tức, nạp/rút tiền
        </p>
      </div>
      <TradeForm />
      <TradeTable />
    </div>
  );
}
