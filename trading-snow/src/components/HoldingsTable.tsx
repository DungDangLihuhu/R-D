"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, LineChart } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Pagination } from "@/components/Pagination";
import { SessionBadge } from "@/components/SessionBadge";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import type { Holding, MarketQuote } from "@/lib/types";
import {
  formatMoney,
  formatPnlArrow,
  formatShares,
} from "@/lib/format";

// Bảng (màn rộng) và thẻ (mobile) là hai danh sách riêng: bảng mang vai trò table/row/cell
// cho trình đọc màn hình, thẻ là list — không trộn hai kiểu trong cùng một hàng.
const HOLDING_COLS =
  "grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_2.25rem]";

function pnlClass(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-gray-600";
}

function MetricStack({
  primary,
  secondary,
  align = "right",
  tone,
}: {
  primary: string;
  secondary?: ReactNode;
  align?: "left" | "right" | "center";
  tone?: number | null;
}) {
  const color = tone != null ? pnlClass(tone) : "text-gray-900";
  const subColor = tone != null ? pnlClass(tone) : "text-gray-500";
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";

  return (
    <div className={`${alignClass} w-full`}>
      <p className={`text-sm font-medium tabular-nums leading-tight ${color}`}>
        {primary}
      </p>
      {secondary != null && secondary !== "" && (
        <div
          className={`mt-0.5 w-full text-[11px] tabular-nums leading-tight ${subColor}`}
        >
          {secondary}
        </div>
      )}
    </div>
  );
}

function HoldingRow({
  layout,
  holding,
  quote,
  editing,
  priceInput,
  hidden,
  onEditStart,
  onPriceInput,
  onSavePrice,
  onToggleHidden,
}: {
  layout: "table" | "card";
  holding: Holding;
  quote?: MarketQuote;
  editing: boolean;
  priceInput: string;
  hidden: boolean;
  onEditStart: () => void;
  onPriceInput: (value: string) => void;
  onSavePrice: () => void;
  onToggleHidden: () => void;
}) {
  const market = holding.marketPrice ?? holding.avgCost;
  const value = holding.quantity * market;
  const unrealized = holding.marketPrice ? value - holding.totalCost : 0;
  const pct =
    holding.marketPrice && holding.totalCost > 0
      ? (unrealized / holding.totalCost) * 100
      : 0;
  const dailyChange =
    quote && holding.marketPrice ? quote.change * holding.quantity : null;
  const dailyPct = quote?.changePercent ?? null;
  const extendedSession =
    quote?.marketSession === "pre" || quote?.marketSession === "post"
      ? quote.marketSession
      : undefined;
  const extendedPct = extendedSession ? dailyPct : null;

  const priceSecondary = (align: "left" | "center" | "right") => {
    const items =
      align === "center" ? "items-center" : align === "right" ? "items-end" : "items-start";
    const text =
      align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

    if (editing) {
      return (
        <input
          autoFocus
          type="number"
          step="any"
          value={priceInput}
          onChange={(e) => onPriceInput(e.target.value)}
          onBlur={onSavePrice}
          onKeyDown={(e) => e.key === "Enter" && onSavePrice()}
          className={`mt-0.5 w-full max-w-[8.5rem] rounded border border-gray-300 bg-app-surface px-1.5 py-0.5 text-[11px] tabular-nums ${text}`}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={onEditStart}
        className={`mt-0.5 flex w-full flex-col ${items} ${text} text-[11px] tabular-nums text-brand-ink hover:underline`}
      >
        <span>{formatMoney(market)}/cp</span>
        <SessionBadge session={extendedSession} changePercent={extendedPct} />
      </button>
    );
  };

  const hideBtn = (
    <button
      type="button"
      onClick={onToggleHidden}
      title={hidden ? "Hiện lại trong chỉ số" : "Tạm ẩn khỏi chỉ số"}
      className={`rounded-lg p-1.5 transition-colors ${
        hidden
          ? "text-amber-600 hover:bg-amber-50"
          : "text-gray-400 hover:bg-app-tint hover:text-gray-600"
      }`}
    >
      {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );

  const rowTint = hidden ? "bg-amber-50" : "";

  if (layout === "card") {
    return (
      <li className={`app-row border-b border-gray-100 px-3 py-3 last:border-b-0 ${rowTint}`}>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/stock/${encodeURIComponent(holding.symbol)}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:bg-brand-soft -ml-1 px-1 py-0.5"
          >
            <SymbolIdentity
              symbol={holding.symbol}
              name={quote?.name}
              logo={quote?.logo}
              extra={
                hidden ? (
                  <p className="text-[10px] font-medium text-amber-600">Đang ẩn</p>
                ) : undefined
              }
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <p className="text-sm font-semibold tabular-nums">
              {formatShares(holding.quantity)}
            </p>
            {hideBtn}
          </div>
        </div>

        <div className="my-2.5 border-t border-gray-100" />

        <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
          <span>Giá vốn</span>
          <span className="text-center">Giá hiện tại</span>
          <span className="text-right">Lãi/lỗ</span>
        </div>

        <div className="mt-1 grid grid-cols-3 gap-2">
          <MetricStack
            align="left"
            primary={formatMoney(holding.totalCost)}
            secondary={`${formatMoney(holding.avgCost)}/cp`}
          />
          <MetricStack
            align="center"
            primary={formatMoney(value)}
            secondary={priceSecondary("center")}
          />
          {holding.marketPrice ? (
            <MetricStack
              align="right"
              primary={formatMoney(unrealized)}
              secondary={formatPnlArrow(pct)}
              tone={unrealized}
            />
          ) : (
            <div className="text-right text-sm text-gray-400">—</div>
          )}
        </div>

        {holding.marketPrice && dailyChange != null && dailyPct != null && (
          <>
            <div className="my-2.5 border-t border-gray-100" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Hôm nay</span>
              <div className="text-right">
                <span
                  className={`font-medium tabular-nums ${pnlClass(dailyChange)}`}
                >
                  {formatMoney(dailyChange)}
                </span>
                <span className={`ml-2 tabular-nums ${pnlClass(dailyPct)}`}>
                  {formatPnlArrow(dailyPct)}
                </span>
              </div>
            </div>
          </>
        )}
      </li>
    );
  }

  return (
    <div
      role="row"
      className={`app-row grid ${HOLDING_COLS} items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0 ${rowTint}`}
    >
        <div role="cell" className="min-w-0">
          <Link
            href={`/stock/${encodeURIComponent(holding.symbol)}`}
            className="flex min-w-0 items-center gap-2.5 rounded-lg hover:bg-brand-soft -ml-1 px-1 py-0.5"
          >
            <SymbolIdentity
              symbol={holding.symbol}
              name={quote?.name}
              logo={quote?.logo}
              extra={
                hidden ? (
                  <p className="text-[10px] font-medium text-amber-600">Đang ẩn</p>
                ) : undefined
              }
            />
          </Link>
        </div>

        <p role="cell" className="text-right text-sm font-medium tabular-nums">
          {formatShares(holding.quantity)}
        </p>

        <div role="cell">
          <MetricStack
            primary={formatMoney(holding.totalCost)}
            secondary={`${formatMoney(holding.avgCost)}/cp`}
          />
        </div>

        <div role="cell">
          <MetricStack primary={formatMoney(value)} secondary={priceSecondary("right")} />
        </div>

        <div role="cell" className="text-right">
          {holding.marketPrice ? (
            <MetricStack
              primary={formatMoney(unrealized)}
              secondary={formatPnlArrow(pct)}
              tone={unrealized}
            />
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>

        <div role="cell" className="text-right">
          {dailyChange != null && dailyPct != null ? (
            <MetricStack
              primary={formatMoney(dailyChange)}
              secondary={formatPnlArrow(dailyPct)}
              tone={dailyChange}
            />
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>

        <div role="cell" className="flex justify-end">
          {hideBtn}
        </div>
    </div>
  );
}

export function HoldingsTable() {
  const { stats, state, setMarketPrice, isSymbolHidden, toggleHiddenSymbol } =
    useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const holdings = stats.allHoldings;

  const hiddenCount = holdings.filter((h) => isSymbolHidden(h.symbol)).length;

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(holdings);

  if (holdings.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="Chưa có vị thế mở"
        description="Mua cổ phiếu để thấy danh mục và P&L realtime."
      />
    );
  }

  const savePrice = (symbol: string) => {
    const p = parseFloat(priceInput);
    if (!isNaN(p) && p > 0) setMarketPrice(symbol, p);
    setEditing(null);
  };

  const renderRow = (h: Holding, layout: "table" | "card") => {
    const market = h.marketPrice ?? h.avgCost;
    return (
      <HoldingRow
        key={h.symbol}
        layout={layout}
        holding={h}
        hidden={isSymbolHidden(h.symbol)}
        quote={state.marketQuotes?.[h.symbol]}
        editing={editing === h.symbol}
        priceInput={priceInput}
        onEditStart={() => {
          setEditing(h.symbol);
          setPriceInput(String(market));
        }}
        onPriceInput={setPriceInput}
        onSavePrice={() => savePrice(h.symbol)}
        onToggleHidden={() => toggleHiddenSymbol(h.symbol)}
      />
    );
  };

  return (
    <div className="app-table-wrap">
      {hiddenCount > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {hiddenCount} mã đang ẩn — không tính vào chỉ số trên các trang khác.
        </div>
      )}

      <div role="table" aria-label="Vị thế đang mở" className="hidden md:block">
        <div role="row" className={`app-table-head grid ${HOLDING_COLS} gap-3 px-4 py-2.5`}>
          <span role="columnheader">Vị thế</span>
          <span role="columnheader" className="text-right">
            Số lượng
          </span>
          <span role="columnheader" className="text-right">
            Giá vốn
          </span>
          <span role="columnheader" className="text-right">
            Giá trị
          </span>
          <span role="columnheader" className="text-right">
            Lãi/lỗ
          </span>
          <span role="columnheader" className="text-right">
            Hôm nay
          </span>
          <span role="columnheader" className="sr-only">
            Ẩn/hiện
          </span>
        </div>
        {pageItems.map((h) => renderRow(h, "table"))}
      </div>

      <ul aria-label="Vị thế đang mở" className="md:hidden">
        {pageItems.map((h) => renderRow(h, "card"))}
      </ul>

      <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        Giá từ Yahoo Finance (+ Finnhub/Twelve Data nếu cấu hình). Pre-market &amp; after-hours khi Yahoo có dữ liệu. Bấm tên mã → Phân tích. Bấm giá/cp sửa thủ công. Icon mắt = tạm ẩn mã khỏi chỉ số.
      </p>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
