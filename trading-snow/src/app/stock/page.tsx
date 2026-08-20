"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
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

  if (symbols.length > 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Phân tích" description="Đang chuyển tới mã trong danh mục…" />
        <div className="app-skeleton h-36" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân tích"
        description="Chỉ số cơ bản · báo cáo · tin tức · giao dịch nội bộ"
      />
      <EmptyState
        icon={Inbox}
        title="Chưa có mã để phân tích"
        description="Thêm giao dịch hoặc mở trực tiếp một mã (ví dụ /stock/AAPL)."
        action={
          <Link href="/trades" className="app-btn-primary">
            Thêm giao dịch
          </Link>
        }
      />
    </div>
  );
}
