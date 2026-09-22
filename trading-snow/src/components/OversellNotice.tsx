import { formatDate, formatShares } from "@/lib/format";
import type { Oversell } from "@/lib/trade-display";

export function OversellNotice({ oversells }: { oversells: Oversell[] }) {
  if (oversells.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <p className="font-medium">Bán vượt số đang giữ ({oversells.length})</p>
      <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4 text-xs">
        {oversells.slice(0, 10).map((o) => (
          <li key={`${o.symbol}-${o.date}-${o.sold}`}>
            {formatDate(o.date)} · {o.symbol}: bán {formatShares(o.sold)} nhưng chỉ đang giữ{" "}
            {formatShares(o.held)} — thường do thiếu lệnh mua hoặc chưa ghi split. Vẫn import được,
            nhưng giá vốn phần vượt là ước đoán.
          </li>
        ))}
      </ul>
    </div>
  );
}
