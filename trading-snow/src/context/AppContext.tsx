"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { computePortfolioStats } from "@/lib/stats";
import { hiddenSymbolSet } from "@/lib/hidden-symbols";
import {
  checkCloudConfigured,
  getSyncRoomId,
  loadRemoteState,
  saveRemoteState,
} from "@/lib/remote-storage";
import { QUOTE_BATCH_SIZE } from "@/lib/quote-providers";
import { defaultState, loadState, saveState } from "@/lib/storage";
import { filterDuplicateTransactions } from "@/lib/transaction-dedup";
import { toast } from "@/lib/toast-store";
import type {
  AppState,
  MarketSession,
  Portfolio,
  PortfolioStats,
  Transaction,
} from "@/lib/types";

interface AppContextValue {
  state: AppState;
  activePortfolioId: string;
  setActivePortfolioId: (id: string) => void;
  stats: PortfolioStats;
  hiddenSymbols: Set<string>;
  isSymbolHidden: (symbol: string) => boolean;
  toggleHiddenSymbol: (symbol: string) => void;
  priceLoading: boolean;
  quoteUnresolved: string[];
  cloudConfigured: boolean;
  syncRoom: string;
  addPortfolio: (name: string, currency: string) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => {
    added: number;
    skipped: number;
  };
  deleteTransaction: (id: string) => void;
  restoreTransaction: (tx: Transaction) => void;
  setMarketPrice: (symbol: string, price: number) => void;
  setMarketPrices: (prices: Record<string, number>) => void;
  refreshPrices: (symbols?: string[], opts?: { notify?: boolean }) => Promise<void>;
  exportData: () => string;
  importData: (json: string) => boolean;
  clearAllTransactions: () => void;
  clearPortfolioTransactions: (portfolioId: string) => void;
}

type AppActions = Pick<
  AppContextValue,
  | "setActivePortfolioId"
  | "toggleHiddenSymbol"
  | "addPortfolio"
  | "addTransaction"
  | "importTransactions"
  | "deleteTransaction"
  | "restoreTransaction"
  | "setMarketPrice"
  | "setMarketPrices"
  | "refreshPrices"
  | "exportData"
  | "importData"
  | "clearAllTransactions"
  | "clearPortfolioTransactions"
>;

const AppContext = createContext<AppContextValue | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [activePortfolioId, setActivePortfolioId] = useState("default");
  const [hydrated, setHydrated] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [quoteUnresolved, setQuoteUnresolved] = useState<string[]>([]);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [syncRoom, setSyncRoom] = useState("shared");

  const lastRemoteUpdatedAt = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPolling = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const local = loadState();
      setState(local);
      setActivePortfolioId(local.portfolios[0]?.id ?? "default");
      setHydrated(true);

      const configured = await checkCloudConfigured();
      if (cancelled) return;

      const room = getSyncRoomId();
      setSyncRoom(room);
      setCloudConfigured(configured);

      if (!configured) return;

      const remote = await loadRemoteState(room);
      if (cancelled) return;

      if (remote) {
        lastRemoteUpdatedAt.current = remote.updatedAt;
        setState(remote.state);
        saveState(remote.state);
        setActivePortfolioId(remote.state.portfolios[0]?.id ?? "default");
      } else if (local.transactions.length > 0 || local.portfolios.length > 1) {
        const ts = await saveRemoteState(room, local);
        if (ts) lastRemoteUpdatedAt.current = ts;
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state);

    if (!cloudConfigured) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ts = await saveRemoteState(syncRoom, state);
      if (ts) lastRemoteUpdatedAt.current = ts;
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated, cloudConfigured, syncRoom]);

  useEffect(() => {
    if (!hydrated || !cloudConfigured) return;

    const poll = async () => {
      if (isPolling.current || document.hidden) return;
      isPolling.current = true;
      try {
        const remote = await loadRemoteState(syncRoom);
        if (!remote || remote.updatedAt === lastRemoteUpdatedAt.current) return;
        lastRemoteUpdatedAt.current = remote.updatedAt;
        setState(remote.state);
        saveState(remote.state);
      } finally {
        isPolling.current = false;
      }
    };

    // Tab ẩn thì ngừng poll (đỡ pin + request Upstash), quay lại thì đồng bộ ngay.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };

    const id = setInterval(poll, 20_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, cloudConfigured, syncRoom]);

  const hiddenSymbols = useMemo(
    () => hiddenSymbolSet(state.hiddenSymbols?.[activePortfolioId]),
    [state.hiddenSymbols, activePortfolioId]
  );

  const stats = useMemo(
    () =>
      computePortfolioStats(
        state.transactions,
        activePortfolioId,
        state.marketPrices,
        state.marketQuotes ?? {},
        hiddenSymbols
      ),
    [
      state.transactions,
      state.marketPrices,
      state.marketQuotes,
      activePortfolioId,
      hiddenSymbols,
    ]
  );

  const holdingSymbols = useMemo(() => {
    const syms = stats.allHoldings.map((h) => h.symbol);
    return syms.length ? syms : stats.holdings.map((h) => h.symbol);
  }, [stats.allHoldings, stats.holdings]);

  // Đọc giá trị mới nhất qua ref để các action giữ nguyên identity giữa các render.
  // Action chỉ chạy từ event handler nên luôn đọc được giá trị đã commit.
  const stateRef = useRef(state);
  const activePortfolioIdRef = useRef(activePortfolioId);
  const holdingSymbolsRef = useRef(holdingSymbols);

  useEffect(() => {
    stateRef.current = state;
    activePortfolioIdRef.current = activePortfolioId;
    holdingSymbolsRef.current = holdingSymbols;
  });

  const isSymbolHidden = useCallback(
    (symbol: string) => hiddenSymbols.has(symbol.toUpperCase()),
    [hiddenSymbols]
  );

  const toggleHiddenSymbol = useCallback((symbol: string) => {
    const sym = symbol.toUpperCase();
    const portfolioId = activePortfolioIdRef.current;
    setState((s) => {
      const map = { ...(s.hiddenSymbols ?? {}) };
      const list = [...(map[portfolioId] ?? [])];
      const idx = list.indexOf(sym);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(sym);
      map[portfolioId] = list;
      return { ...s, hiddenSymbols: map };
    });
  }, []);

  const refreshPrices = useCallback(async (symbols?: string[], opts?: { notify?: boolean }) => {
    const list = symbols ?? holdingSymbolsRef.current;
    if (list.length === 0) return;

    setPriceLoading(true);
    setQuoteUnresolved([]);
    try {
      const mergedPrices: Record<string, number> = {};
      const mergedQuotes: {
        symbol: string;
        price: number;
        change?: number;
        changePercent?: number;
        shortName?: string;
        logo?: string;
        marketSession?: MarketSession;
      }[] = [];
      let mergedUnresolved: string[] = [];
      let truncated = false;

      const chunks: string[][] = [];
      for (let i = 0; i < list.length; i += QUOTE_BATCH_SIZE) {
        chunks.push(list.slice(i, i + QUOTE_BATCH_SIZE));
      }

      const batchResults = await Promise.all(
        chunks.map(async (chunk) => {
          const res = await fetch(`/api/quotes?symbols=${chunk.join(",")}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error ?? `Không lấy được giá (HTTP ${res.status})`);
          }
          return data as {
            prices?: Record<string, number>;
            quotes?: {
              symbol: string;
              price: number;
              change?: number;
              changePercent?: number;
              shortName?: string;
              logo?: string;
              marketSession?: MarketSession;
            }[];
            unresolved?: string[];
            truncated?: boolean;
          };
        })
      );

      for (const data of batchResults) {
        Object.assign(mergedPrices, data.prices ?? {});
        mergedQuotes.push(...(data.quotes ?? []));
        mergedUnresolved = [...mergedUnresolved, ...(data.unresolved ?? [])];
        if (data.truncated) truncated = true;
      }

      mergedUnresolved = [...new Set(mergedUnresolved)].filter((s) => !mergedPrices[s]);
      const updatedAt = new Date().toISOString();

      setState((s) => {
        const marketPrices = { ...s.marketPrices, ...mergedPrices };
        const marketQuotes = { ...(s.marketQuotes ?? {}) };
        for (const q of mergedQuotes) {
          if (q.price > 0) {
            marketPrices[q.symbol] = q.price;
            marketQuotes[q.symbol] = {
              price: q.price,
              change: q.change ?? 0,
              changePercent: q.changePercent ?? 0,
              name: q.shortName,
              logo: q.logo,
              marketSession: q.marketSession,
            };
          }
        }
        return {
          ...s,
          marketPrices,
          marketQuotes,
          pricesUpdatedAt: updatedAt,
        };
      });
      setQuoteUnresolved(mergedUnresolved);

      if (opts?.notify) {
        const updated = Object.keys(mergedPrices).length;
        if (updated === 0) {
          toast.error(
            "Không lấy được giá nào. Mở /api/quotes?check=1 để kiểm tra Yahoo/Finnhub trên server."
          );
        } else if (mergedUnresolved.length > 0) {
          toast.warning(
            `Đã cập nhật ${updated}/${list.length} mã. Chưa có giá: ${mergedUnresolved.join(", ")}${truncated ? " (>150 mã — bị cắt bớt)" : ""}`
          );
        } else {
          toast.success(
            `Đã cập nhật ${updated} mã.${truncated ? " (>150 mã — bị cắt bớt)" : ""}`
          );
        }
      }
    } catch (e) {
      if (opts?.notify) {
        toast.error(e instanceof Error ? e.message : "Không lấy được giá");
      }
    } finally {
      setPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || holdingSymbols.length === 0) return;
    const stale =
      !state.pricesUpdatedAt ||
      Date.now() - new Date(state.pricesUpdatedAt).getTime() > 5 * 60 * 1000;
    if (!stale) return;

    const symbols = [...holdingSymbols];
    const tid = globalThis.setTimeout(() => {
      void refreshPrices(symbols);
    }, 0);

    return () => globalThis.clearTimeout(tid);
  }, [hydrated, holdingSymbols, refreshPrices, state.pricesUpdatedAt]);

  const addPortfolio = useCallback((name: string, currency: string) => {
    const portfolio: Portfolio = {
      id: crypto.randomUUID(),
      name,
      currency,
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, portfolios: [...s.portfolios, portfolio] }));
    setActivePortfolioId(portfolio.id);
  }, []);

  const addTransaction = useCallback((tx: Omit<Transaction, "id">) => {
    setState((s) => ({
      ...s,
      transactions: [...s.transactions, { ...tx, id: crypto.randomUUID() }],
    }));
  }, []);

  const importTransactions = useCallback((txs: Omit<Transaction, "id">[]) => {
    let added = 0;
    let skipped = 0;

    setState((s) => {
      const { transactions: newTxs, skipped: dupCount } = filterDuplicateTransactions(
        s.transactions,
        txs
      );
      added = newTxs.length;
      skipped = dupCount;
      if (newTxs.length === 0) return s;
      return {
        ...s,
        transactions: [
          ...s.transactions,
          ...newTxs.map((tx) => ({ ...tx, id: crypto.randomUUID() })),
        ],
      };
    });

    return { added, skipped };
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
  }, []);

  /** Hoàn tác xóa: giữ nguyên id cũ để không nhân bản khi bấm hai lần. */
  const restoreTransaction = useCallback((tx: Transaction) => {
    setState((s) =>
      s.transactions.some((t) => t.id === tx.id)
        ? s
        : { ...s, transactions: [...s.transactions, tx] }
    );
  }, []);

  const setMarketPrice = useCallback((symbol: string, price: number) => {
    setState((s) => ({
      ...s,
      marketPrices: { ...s.marketPrices, [symbol.toUpperCase()]: price },
    }));
  }, []);

  const setMarketPrices = useCallback((prices: Record<string, number>) => {
    setState((s) => ({
      ...s,
      marketPrices: { ...s.marketPrices, ...prices },
      pricesUpdatedAt: new Date().toISOString(),
    }));
  }, []);

  const exportData = useCallback(
    () => JSON.stringify(stateRef.current, null, 2),
    []
  );

  const importData = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as AppState;
      if (!parsed.portfolios || !parsed.transactions) return false;
      setState(parsed);
      setActivePortfolioId(parsed.portfolios[0]?.id ?? "default");
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearAllTransactions = useCallback(() => {
    setState((s) => ({
      ...s,
      transactions: [],
      marketPrices: {},
      marketQuotes: {},
      pricesUpdatedAt: null,
    }));
  }, []);

  const clearPortfolioTransactions = useCallback((portfolioId: string) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.portfolioId !== portfolioId),
    }));
  }, []);

  // Identity ổn định: component chỉ cần action sẽ không re-render khi state đổi.
  const actions = useMemo<AppActions>(
    () => ({
      setActivePortfolioId,
      toggleHiddenSymbol,
      addPortfolio,
      addTransaction,
      importTransactions,
      deleteTransaction,
      restoreTransaction,
      setMarketPrice,
      setMarketPrices,
      refreshPrices,
      exportData,
      importData,
      clearAllTransactions,
      clearPortfolioTransactions,
    }),
    [
      toggleHiddenSymbol,
      addPortfolio,
      addTransaction,
      importTransactions,
      deleteTransaction,
      restoreTransaction,
      setMarketPrice,
      setMarketPrices,
      refreshPrices,
      exportData,
      importData,
      clearAllTransactions,
      clearPortfolioTransactions,
    ]
  );

  const contextValue = useMemo<AppContextValue>(
    () => ({
      ...actions,
      state,
      activePortfolioId,
      stats,
      hiddenSymbols,
      isSymbolHidden,
      priceLoading,
      quoteUnresolved,
      cloudConfigured,
      syncRoom,
    }),
    [
      actions,
      state,
      activePortfolioId,
      stats,
      hiddenSymbols,
      isSymbolHidden,
      priceLoading,
      quoteUnresolved,
      cloudConfigured,
      syncRoom,
    ]
  );

  return (
    <AppActionsContext.Provider value={actions}>
      <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
    </AppActionsContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** Chỉ các action — không re-render khi state đổi. */
export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions must be used within AppProvider");
  return ctx;
}
