"use client";

import { AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatDecimal, formatMoney } from "@/lib/format";
import { currencyUnit } from "@/lib/fx";
import { tickerWithExchange } from "@/lib/symbol-profile";

const MAX_ROWS = 8;
/** Từ ngưỡng này một mã đủ lớn để tự nó kéo cả danh mục lên xuống. */
const CONCENTRATION_PCT = 25;

interface Slice {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
}

function BarList({ title, items, total }: { title: string; items: Slice[]; total: number }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-app-muted">{title}</h3>
      <ul className="space-y-2.5">
        {items.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <li key={item.key} title={`${item.label}: ${formatMoney(item.value)}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-app-text">{item.label}</span>
                  {item.sublabel && (
                    <span className="ml-1.5 text-xs text-app-muted">{item.sublabel}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-app-text">
                  {formatDecimal(pct, 1)}%
                  <span className="ml-2 text-xs text-app-muted">{formatMoney(item.value)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-app-tint" aria-hidden>
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(pct, 0.5)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Tỷ trọng giá trị cổ phiếu theo mã và theo đồng tiền niêm yết (đã quy ra USD). */
export function AllocationCard() {
  const { stats, state, currencyOf } = useApp();

  const holdings = stats.holdings
    .map((h) => ({ symbol: h.symbol, value: h.quantity * (h.marketPrice ?? h.avgCost) }))
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = holdings.reduce((sum, h) => sum + h.value, 0);
  if (holdings.length < 2 || total <= 0) return null;

  // Mã đứng trước để khi tên dài bị cắt vẫn còn mã.
  const bySymbol: Slice[] = holdings.slice(0, MAX_ROWS).map((h) => ({
    key: h.symbol,
    label: tickerWithExchange(h.symbol),
    sublabel: state.marketQuotes?.[h.symbol]?.name,
    value: h.value,
  }));
  const rest = holdings.slice(MAX_ROWS);
  if (rest.length > 0) {
    bySymbol.push({
      key: "__other",
      label: `Khác (${rest.length} mã)`,
      value: rest.reduce((sum, h) => sum + h.value, 0),
    });
  }

  const currencyTotals = new Map<string, number>();
  for (const h of holdings) {
    const base = currencyUnit(currencyOf(h.symbol)).base;
    currencyTotals.set(base, (currencyTotals.get(base) ?? 0) + h.value);
  }
  const byCurrency: Slice[] = [...currencyTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([currency, value]) => ({ key: currency, label: currency, value }));

  const top = holdings[0];
  const topPct = (top.value / total) * 100;

  return (
    <section className="app-card space-y-4" aria-labelledby="allocation-title">
      <h2 id="allocation-title" className="app-card-section-title mb-0">
        Phân bổ danh mục
      </h2>
      {topPct >= CONCENTRATION_PCT && (
        <p className="app-alert-warning flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Rủi ro tập trung:</strong> {tickerWithExchange(top.symbol)} chiếm{" "}
            {formatDecimal(topPct, 0)}% giá trị cổ phiếu, nên biến động của riêng mã này chi phối
            phần lớn danh mục.
          </span>
        </p>
      )}
      {/* Chỉ một đồng tiền thì cột tiền tệ luôn là 100%, không đáng hiển thị. */}
      <div className={`grid gap-6 ${byCurrency.length > 1 ? "md:grid-cols-[2fr_1fr]" : ""}`}>
        <BarList title="Theo mã" items={bySymbol} total={total} />
        {byCurrency.length > 1 && <BarList title="Theo tiền tệ" items={byCurrency} total={total} />}
      </div>
    </section>
  );
}
