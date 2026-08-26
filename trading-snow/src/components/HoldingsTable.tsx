"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff, LineChart } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { Pagination } from "@/components/Pagination";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import type { Holding, MarketQuote, MarketSession } from "@/lib/types";
import {
  formatMoney,
  formatPercent,
  formatPnlArrow,
  formatShares,
} from "@/lib/format";

function pnlClass(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-gray-600";
}

function SessionBadge({
  session,
  changePercent,
}: {
  session?: MarketSession;
  changePercent?: number | null;
}) {
  if (session !== "pre" && session !== "post") return null;
  const label = session === "pre" ? "Pre-market" : "After hours";
  if (changePercent == null || !Number.isFinite(changePercent)) {
    return (
      <span className="mt-0.5 block text-[10px] font-medium text-violet-600">
        ({label})
      </span>
    );
  }
  return (
    <span
      className={`mt-0.5 block text-[10px] font-semibold tabular-nums whitespace-nowrap ${pnlClass(changePercent)}`}
    >
      ({label} {formatPercent(changePercent)})
    </span>
  );
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
          className={`mt-0.5 w-full max-w-[8.5rem] rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] tabular-nums ${text}`}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={onEditStart}
        className={`mt-0.5 flex w-full flex-col ${items} ${text} text-[11px] tabular-nums text-sky-600 hover:underline`}
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
          : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      }`}
    >
      {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  );

  return (
    <div
      className={`app-row border-b border-gray-100 px-3 py-3 last:border-b-0 md:px-4 md:py-2.5 ${
        hidden ? "bg-amber-50" : ""
      }`}
    >
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/stock/${encodeURIComponent(holding.symbol)}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:bg-sky-50/80 -ml-1 px-1 py-0.5"
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
      </div>

      <div className="hidden md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-3">
        <Link
          href={`/stock/${encodeURIComponent(holding.symbol)}`}
          className="flex min-w-0 items-center gap-2.5 rounded-lg hover:bg-sky-50/80 -ml-1 px-1 py-0.5"
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

        <p className="text-right text-sm font-medium tabular-nums">
          {formatShares(holding.quantity)}
        </p>

        <MetricStack
          primary={formatMoney(holding.totalCost)}
          secondary={`${formatMoney(holding.avgCost)}/cp`}
        />

        <MetricStack primary={formatMoney(value)} secondary={priceSecondary("right")} />

        {holding.marketPrice ? (
          <MetricStack
            primary={formatMoney(unrealized)}
            secondary={formatPnlArrow(pct)}
            tone={unrealized}
          />
        ) : (
          <span className="text-right text-sm text-gray-400">—</span>
        )}

        {dailyChange != null && dailyPct != null ? (
          <MetricStack
            primary={formatMoney(dailyChange)}
            secondary={formatPnlArrow(dailyPct)}
            tone={dailyChange}
          />
        ) : (
          <span className="text-right text-sm text-gray-400">—</span>
        )}

        <div className="flex justify-end">{hideBtn}</div>
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

  return (
    <div className="app-table-wrap">
      {hiddenCount > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {hiddenCount} mã đang ẩn — không tính vào chỉ số trên các trang khác.
        </div>
      )}

      <div className="app-table-head hidden px-4 py-2.5 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:gap-3">
        <span>Vị thế</span>
        <span className="text-right">Số lượng</span>
        <span className="text-right">Giá vốn</span>
        <span className="text-right">Giá trị</span>
        <span className="text-right">Lãi/lỗ</span>
        <span className="text-right">Hôm nay</span>
        <span className="sr-only">Ẩn/hiện</span>
      </div>

      <div>
        {pageItems.map((h) => {
          const market = h.marketPrice ?? h.avgCost;
          const hidden = isSymbolHidden(h.symbol);
          return (
            <HoldingRow
              key={h.symbol}
              holding={h}
              hidden={hidden}
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
        })}
      </div>

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
