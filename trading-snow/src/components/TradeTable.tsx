"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, StickyNote, Trash2, Wallet } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { EmptyState } from "@/components/EmptyState";
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
import { toast } from "@/lib/toast-store";
import type { Transaction, TransactionType } from "@/lib/types";

// Cột thao tác rộng cố định để hàng tiêu đề và hàng dữ liệu ăn khớp nhau.
const GRID =
  "md:grid-cols-[0.7fr_minmax(0,1.6fr)_0.9fr_0.6fr_0.8fr_0.6fr_0.9fr_0.95fr_3.5rem]";

const typeLabels: Record<string, string> = {
  BUY: "Mua",
  SELL: "Bán",
  DIVIDEND: "Cổ tức",
  DEPOSIT: "Nạp",
  WITHDRAW: "Rút",
};

type TypeFilter = "ALL" | TransactionType | "CASH";
type SortKey = "date" | "quantity" | "price" | "gross" | "pnl";

const typeFilters: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "BUY", label: "Mua" },
  { value: "SELL", label: "Bán" },
  { value: "DIVIDEND", label: "Cổ tức" },
  { value: "CASH", label: "Nạp / Rút" },
];

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
    <div className="app-card app-card-static p-4 text-sm">
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

function SortHeader({
  label,
  sortKey,
  active,
  desc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  desc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const Arrow = desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center justify-end gap-1 hover:text-app-text ${
        active ? "text-app-text" : ""
      }`}
    >
      {label}
      {active && <Arrow className="h-3 w-3" />}
    </button>
  );
}

function TradeRow({
  tx,
  companyName,
  companyLogo,
  pnl,
  onDelete,
}: {
  tx: Transaction;
  companyName: string;
  companyLogo?: string;
  pnl?: { pnl: number; pnlPercent: number };
  onDelete: () => void;
}) {
  const cash = isCashSymbol(tx.symbol);

  const deleteBtn = (
    <button
      type="button"
      onClick={onDelete}
      className="app-btn-danger-ghost p-1.5"
      aria-label={`Xóa giao dịch ${typeLabels[tx.type]} ${tx.symbol}`}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="app-row border-b border-gray-100 px-3 py-3 last:border-b-0 md:px-4 md:py-2.5">
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
            {tx.notes && (
              <span className="inline-flex items-center gap-1" title={tx.notes}>
                <StickyNote className="h-3.5 w-3.5" />
                Ghi chú
              </span>
            )}
          </div>
          {deleteBtn}
        </div>
      </div>

      <div className={`hidden md:grid ${GRID} md:items-center md:gap-2`}>
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

        <div className="flex items-center justify-end gap-1">
          {tx.notes ? (
            <span title={tx.notes} className="text-gray-400">
              <StickyNote className="h-4 w-4" />
            </span>
          ) : (
            <span className="w-4" />
          )}
          {deleteBtn}
        </div>
      </div>
    </div>
  );
}

export function TradeTable() {
  const { state, activePortfolioId, deleteTransaction, restoreTransaction } =
    useApp();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);

  const { pnlByTxId, summary } = useMemo(
    () => computeTradeDisplay(state.transactions, activePortfolioId),
    [state.transactions, activePortfolioId]
  );

  const portfolioTrades = useMemo(
    () => state.transactions.filter((t) => t.portfolioId === activePortfolioId),
    [state.transactions, activePortfolioId]
  );

  const trades = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = portfolioTrades.filter((t) => {
      if (typeFilter === "CASH") {
        if (t.type !== "DEPOSIT" && t.type !== "WITHDRAW") return false;
      } else if (typeFilter !== "ALL" && t.type !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        (t.notes ?? "").toLowerCase().includes(q)
      );
    });

    const value = (t: Transaction) => {
      switch (sortKey) {
        case "quantity":
          return t.quantity;
        case "price":
          return t.price;
        case "gross":
          return tradeGross(t);
        case "pnl":
          return pnlByTxId.get(t.id)?.pnl ?? Number.NEGATIVE_INFINITY;
        default:
          return 0;
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const diff =
        sortKey === "date"
          ? a.date.localeCompare(b.date)
          : value(a) - value(b);
      return sortDesc ? -diff : diff;
    });

    return sorted;
  }, [portfolioTrades, query, typeFilter, sortKey, sortDesc, pnlByTxId]);

  const { page, setPage, totalPages, pageItems, pageSize, total } =
    usePagination(trades, [activePortfolioId, query, typeFilter, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortDesc(true);
  };

  const handleDelete = (tx: Transaction) => {
    deleteTransaction(tx.id);
    toast.show({
      title: `Đã xóa ${typeLabels[tx.type]} ${tx.symbol}`,
      description: `${formatDate(tx.date)} · ${formatMoney(tradeGross(tx))}`,
      variant: "warning",
      duration: 8000,
      action: { label: "Hoàn tác", onClick: () => restoreTransaction(tx) },
    });
  };

  if (portfolioTrades.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Chưa có giao dịch"
        description="Import CSV, tin nhắn ngân hàng hoặc thêm thủ công để bắt đầu."
      />
    );
  }

  return (
    <div className="space-y-4">
      <TradeSummaryCard {...summary} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <span className="sr-only">Tìm theo mã hoặc ghi chú</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã hoặc ghi chú…"
            className="app-input w-full py-1.5 pl-8"
          />
        </label>
        <div className="app-segmented flex-wrap">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`app-segmented-item ${
                typeFilter === f.value ? "app-segmented-item-active" : ""
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {trades.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có giao dịch khớp bộ lọc"
          description="Thử đổi từ khóa hoặc chọn lại loại lệnh."
        />
      ) : (
        <div className="app-table-wrap">
          <div
            className={`app-table-head hidden px-4 py-2.5 md:grid ${GRID} md:gap-2`}
          >
            <span>Loại</span>
            <span>Vị thế</span>
            <span className="text-right">
              <SortHeader
                label="Ngày"
                sortKey="date"
                active={sortKey === "date"}
                desc={sortDesc}
                onSort={handleSort}
              />
            </span>
            <span className="text-right">
              <SortHeader
                label="SL"
                sortKey="quantity"
                active={sortKey === "quantity"}
                desc={sortDesc}
                onSort={handleSort}
              />
            </span>
            <span className="text-right">
              <SortHeader
                label="Giá"
                sortKey="price"
                active={sortKey === "price"}
                desc={sortDesc}
                onSort={handleSort}
              />
            </span>
            <span className="text-right">Phí</span>
            <span className="text-right">
              <SortHeader
                label="Tổng"
                sortKey="gross"
                active={sortKey === "gross"}
                desc={sortDesc}
                onSort={handleSort}
              />
            </span>
            <span className="text-right">
              <SortHeader
                label="Lãi/lỗ"
                sortKey="pnl"
                active={sortKey === "pnl"}
                desc={sortDesc}
                onSort={handleSort}
              />
            </span>
            <span className="sr-only">Thao tác</span>
          </div>

          <div>
            {pageItems.map((tx) => (
              <TradeRow
                key={tx.id}
                tx={tx}
                companyName={state.marketQuotes?.[tx.symbol]?.name ?? tx.symbol}
                companyLogo={state.marketQuotes?.[tx.symbol]?.logo}
                pnl={pnlByTxId.get(tx.id)}
                onDelete={() => handleDelete(tx)}
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
      )}
    </div>
  );
}
