"use client";

import { useState, type ReactNode } from "react";
import { SymbolAvatar } from "@/components/SymbolAvatar";
import { Pagination } from "@/components/Pagination";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import type { Holding, MarketQuote } from "@/lib/types";
import {
  formatMoney,
  formatPnlArrow,
  formatShares,
} from "@/lib/format";

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
    <div className={alignClass}>
      <p className={`text-sm font-medium tabular-nums leading-tight ${color}`}>
        {primary}
      </p>
      {secondary != null && secondary !== "" && (
        <div
          className={`mt-0.5 text-[11px] tabular-nums leading-tight ${subColor}`}
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
  onEditStart,
  onPriceInput,
  onSavePrice,
}: {
  holding: Holding;
  quote?: MarketQuote;
  editing: boolean;
  priceInput: string;
  onEditStart: () => void;
  onPriceInput: (value: string) => void;
  onSavePrice: () => void;
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
  const displayName = quote?.name ?? holding.symbol;

  const priceSecondary = editing ? (
    <input
      autoFocus
      type="number"
      step="any"
      value={priceInput}
      onChange={(e) => onPriceInput(e.target.value)}
      onBlur={onSavePrice}
      onKeyDown={(e) => e.key === "Enter" && onSavePrice()}
      className="mx-auto mt-0.5 w-full max-w-[6.5rem] rounded border border-gray-300 bg-white px-1.5 py-0.5 text-center text-[11px]"
    />
  ) : (
    <button
      type="button"
      onClick={onEditStart}
      className="mt-0.5 block w-full text-[11px] tabular-nums text-sky-600 hover:underline"
    >
      {formatMoney(market)}/cp
    </button>
  );

  return (
    <div className="border-b border-gray-100 px-3 py-3 last:border-b-0 md:px-4 md:py-2.5">
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <SymbolAvatar symbol={holding.symbol} />
            <p className="truncate text-sm font-semibold leading-tight">
              {displayName}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums">
            {formatShares(holding.quantity)}
          </p>
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
            secondary={priceSecondary}
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

      <div className="hidden md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] md:items-center md:gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <SymbolAvatar symbol={holding.symbol} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {displayName}
            </p>
          </div>
        </div>

        <p className="text-right text-sm font-medium tabular-nums">
          {formatShares(holding.quantity)}
        </p>

        <MetricStack
          primary={formatMoney(holding.totalCost)}
          secondary={`${formatMoney(holding.avgCost)}/cp`}
        />

        <MetricStack primary={formatMoney(value)} secondary={priceSecondary} />

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
      </div>
    </div>
  );
}

export function HoldingsTable() {
  const { stats, state, setMarketPrice } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(stats.holdings);

  if (stats.holdings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
        Chưa có vị thế mở. Mua cổ phiếu để thấy danh mục.
      </div>
    );
  }

  const savePrice = (symbol: string) => {
    const p = parseFloat(priceInput);
    if (!isNaN(p) && p > 0) setMarketPrice(symbol, p);
    setEditing(null);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="hidden border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] md:gap-3">
        <span>Vị thế</span>
        <span className="text-right">Số lượng</span>
        <span className="text-right">Giá vốn</span>
        <span className="text-right">Giá trị</span>
        <span className="text-right">Lãi/lỗ</span>
        <span className="text-right">Hôm nay</span>
      </div>

      <div>
        {pageItems.map((h) => {
          const market = h.marketPrice ?? h.avgCost;
          return (
            <HoldingRow
              key={h.symbol}
              holding={h}
              quote={state.marketQuotes?.[h.symbol]}
              editing={editing === h.symbol}
              priceInput={priceInput}
              onEditStart={() => {
                setEditing(h.symbol);
                setPriceInput(String(market));
              }}
              onPriceInput={setPriceInput}
              onSavePrice={() => savePrice(h.symbol)}
            />
          );
        })}
      </div>

      <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
        Giá từ Yahoo Finance (+ Finnhub/Twelve Data nếu cấu hình). Bấm giá/cp sửa thủ công.
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
