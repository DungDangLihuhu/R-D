"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

export default function StockPickerPage() {
  const router = useRouter();
  const { stats } = useApp();
  const symbols = [...new Set(stats.holdings.map((h) => h.symbol))];

  useEffect(() => {
    if (symbols.length > 0) {
      router.replace(`/stock/${encodeURIComponent(symbols[0])}`);
    }
  }, [symbols.join(","), router]);

  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
      {symbols.length === 0
        ? "Chưa có mã trong danh mục — thêm giao dịch để phân tích."
        : "Đang chuyển..."}
    </div>
  );
}
