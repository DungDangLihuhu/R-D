"use client";

import { useMemo } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { SymbolIdentity } from "@/components/SymbolIdentity";
import { useApp } from "@/context/AppContext";
import { usePagination } from "@/hooks/usePagination";
import {
  computeTradeDisplay,
  isCashSymbol,
  tradeGross,
} from "@/lib/trade-display";
import {
  formatDate,
  formatMoney,
  formatPnlArrow,
  formatShares,
} from "@/lib/format";
import type { Transaction } from "@/lib/types";

const typeLabels: Record<string, string> = {
  BUY: "Mua",
  SELL: "Bán",
  DIVIDEND: "Cổ tức",
  DEPOSIT: "Nạp",
  WITHDRAW: "Rút",
};

function typeTone(type: string) {
  if (type === "BUY") return "text-emerald-600";
  if (type === "SELL") return "text-rose-600";
  return "text-gray-700";
}

function pnlClass(value: number) {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-gray-600";
}

function formatSignedGross(tx: Transaction) {
  const gross = tradeGross(tx);
  if (tx.type === "BUY" || tx.type === "WITHDRAW") {
    return `-${formatMoney(gross)}`;
  }
  return `+${formatMoney(gross)}`;
}

function grossTone(tx: Transaction) {
  if (tx.type === "BUY" || tx.type === "WITHDRAW") return "text-rose-600";
  if (tx.type === "SELL" || tx.type === "DIVIDEND" || tx.type === "DEPOSIT") {
    return "text-emerald-600";
  }
  return "text-gray-900";
}

function TradeSummaryCard({
  buyTotal,
  sellTotal,
  feeTotal,
}: {
  buyTotal: number;
  sellTotal: number;
  feeTotal: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-gray-500">Mua</p>
          <p className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatMoney(buyTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Bán</p>
          <p className="mt-0.5 font-semibold tabular-nums text-rose-700">
            {formatMoney(sellTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Phí</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {formatMoney(feeTotal)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TradeRow({
  tx,
  portfolioName,
  companyName,
  companyLogo,
  pnl,
  onDelete,
}: {
  tx: Transaction;
  portfolioName: string;
  companyName: string;
  companyLogo?: string;
  pnl?: { pnl: number; pnlPercent: number };
  onDelete: () => void;
}) {
  const cash = isCashSymbol(tx.symbol);

  return (
    <div className="border-b border-gray-100 px-3 py-3 last:border-b-0 md:px-4 md:py-2.5">
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${typeTone(tx.type)}`}>
              {typeLabels[tx.type]}
            </p>
            {cash ? (
              <p className="text-sm font-medium">Tiền mặt</p>
            ) : (
              <SymbolIdentity
                symbol={tx.symbol}
                name={companyName}
                logo={companyLogo}
                size="sm"
                nameClassName="truncate text-sm font-medium text-gray-900"
                className="mt-1"
              />
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-500">{formatDate(tx.date)}</p>
            <p className="text-sm font-medium tabular-nums">
              {formatShares(tx.quantity)}
            </p>
          </div>
        </div>

        <div className="my-2.5 border-t border-gray-100" />

        <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
          <span>Giá</span>
          <span className="text-center">Phí</span>
          <span className="text-right">Tổng</span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-sm font-medium tabular-nums">
          <span>{formatMoney(tx.price)}</span>
          <span className="text-center">{formatMoney(tx.fee)}</span>
          <span className={`text-right ${grossTone(tx)}`}>
            {formatSignedGross(tx)}
          </span>
        </div>

        {pnl && (
          <>
            <div className="my-2.5 border-t border-gray-100" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">Lãi/lỗ</span>
              <div className="text-right">
                <span className={`font-medium tabular-nums ${pnlClass(pnl.pnl)}`}>
                  {formatMoney(pnl.pnl)}
                </span>
                <span className={`ml-2 tabular-nums ${pnlClass(pnl.pnl)}`}>
                  {formatPnlArrow(pnl.pnlPercent)}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {tx.notes ? (
              <span className="inline-flex items-center gap-1" title={tx.notes}>
                <StickyNote className="h-3.5 w-3.5" />
                Ghi chú
              </span>
            ) : (
              <span>{portfolioName}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
            aria-label="Xóa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="hidden md:grid md:grid-cols-[0.7fr_minmax(0,1.4fr)_0.85fr_0.65fr_0.75fr_0.65fr_0.85fr_0.9fr_0.55fr_0.45fr] md:items-center md:gap-2">
        <p className={`text-sm font-semibold ${typeTone(tx.type)}`}>
          {typeLabels[tx.type]}
        </p>

        <div className="flex min-w-0 items-center gap-2">
          {cash ? (
            <p className="truncate text-sm font-medium">Tiền mặt</p>
          ) : (
            <SymbolIdentity
              symbol={tx.symbol}
              name={companyName}
              logo={companyLogo}
              size="sm"
              nameClassName="truncate text-sm font-medium text-gray-900"
            />
          )}
        </div>

        <p className="text-right text-sm tabular-nums">{formatDate(tx.date)}</p>
        <p className="text-right text-sm font-medium tabular-nums">
          {formatShares(tx.quantity)}
        </p>
        <p className="text-right text-sm tabular-nums">
          {formatMoney(tx.price)}
        </p>
        <p className="text-right text-sm tabular-nums text-gray-500">
          {formatMoney(tx.fee)}
        </p>
        <p className={`text-right text-sm font-medium tabular-nums ${grossTone(tx)}`}>
          {formatSignedGross(tx)}
        </p>

        {pnl ? (
          <div className="text-right">
            <p className={`text-sm font-medium tabular-nums ${pnlClass(pnl.pnl)}`}>
              {formatPnlArrow(pnl.pnlPercent)}
            </p>
            <p className={`text-xs tabular-nums ${pnlClass(pnl.pnl)}`}>
              {formatMoney(pnl.pnl)}
            </p>
          </div>
        ) : (
          <span className="text-right text-sm text-gray-400">—</span>
        )}

        <p className="truncate text-right text-xs text-gray-500">
          {portfolioName}
        </p>

        <div className="flex items-center justify-end gap-1">
          {tx.notes ? (
            <span title={tx.notes} className="text-gray-400">
              <StickyNote className="h-4 w-4" />
            </span>
          ) : (
            <span className="w-4" />
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-rose-200 bg-rose-50 p-1 text-rose-600 hover:bg-rose-100"
            aria-label="Xóa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TradeTable() {
  const { state, activePortfolioId, deleteTransaction } = useApp();
  const trades = state.transactions
    .filter((t) => t.portfolioId === activePortfolioId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const portfolioName =
    state.portfolios.find((p) => p.id === activePortfolioId)?.name ?? "—";

  const { pnlByTxId, summary } = useMemo(
    () => computeTradeDisplay(state.transactions, activePortfolioId),
    [state.transactions, activePortfolioId]
  );

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(trades);

  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
        Chưa có giao dịch. Thêm hoặc import giao dịch đầu tiên.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TradeSummaryCard {...summary} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="hidden border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 md:grid md:grid-cols-[0.7fr_minmax(0,1.4fr)_0.85fr_0.65fr_0.75fr_0.65fr_0.85fr_0.9fr_0.55fr_0.45fr] md:gap-2">
          <span>Loại</span>
          <span>Vị thế</span>
          <span className="text-right">Ngày</span>
          <span className="text-right">SL</span>
          <span className="text-right">Giá</span>
          <span className="text-right">Phí</span>
          <span className="text-right">Tổng</span>
          <span className="text-right">Lãi/lỗ</span>
          <span className="text-right">Danh mục</span>
          <span />
        </div>

        <div>
          {pageItems.map((tx) => (
            <TradeRow
              key={tx.id}
              tx={tx}
              portfolioName={portfolioName}
              companyName={state.marketQuotes?.[tx.symbol]?.name ?? tx.symbol}
              companyLogo={state.marketQuotes?.[tx.symbol]?.logo}
              pnl={pnlByTxId.get(tx.id)}
              onDelete={() => deleteTransaction(tx.id)}
            />
          ))}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
