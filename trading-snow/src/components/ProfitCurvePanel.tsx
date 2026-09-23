"use client";

import dynamic from "next/dynamic";
import { useProfitCurve } from "@/hooks/useProfitCurve";

const EquityChart = dynamic(
  () => import("@/components/Charts").then((m) => m.EquityChart),
  {
    loading: () => <div className="app-skeleton h-[280px]" />,
  }
);

/** Thẻ "Lợi nhuận ròng": chờ giá lịch sử rồi mới vẽ, tránh nháy từ đường tạm sang đường thật. */
export function ProfitCurvePanel({ className = "" }: { className?: string }) {
  const { points, status } = useProfitCurve();

  return (
    <div className={`app-card min-w-0 ${className}`}>
      <h2 className="app-card-section-title">Lợi nhuận ròng</h2>
      {status === "loading" ? (
        <div className="app-skeleton h-[280px]" />
      ) : (
        <EquityChart data={points} />
      )}
      {status === "failed" && (
        <p className="mt-2 text-xs text-app-muted">
          Chưa tải được giá lịch sử — giữa các lệnh đang định giá theo giá khớp gần nhất.
        </p>
      )}
    </div>
  );
}
