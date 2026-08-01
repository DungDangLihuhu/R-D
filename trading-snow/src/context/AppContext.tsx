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
import { v4 as uuid } from "uuid";
import { computePortfolioStats } from "@/lib/stats";
import {
  checkCloudConfigured,
  getSyncRoomId,
  loadRemoteState,
  saveRemoteState,
} from "@/lib/remote-storage";
import { defaultState, loadState, saveState } from "@/lib/storage";
import type {
  AppState,
  Portfolio,
  PortfolioStats,
  Transaction,
} from "@/lib/types";

interface AppContextValue {
  state: AppState;
  activePortfolioId: string;
  setActivePortfolioId: (id: string) => void;
  stats: PortfolioStats;
  priceLoading: boolean;
  quoteUnresolved: string[];
  cloudConfigured: boolean;
  syncRoom: string;
  addPortfolio: (name: string, currency: string) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => void;
  deleteTransaction: (id: string) => void;
  setMarketPrice: (symbol: string, price: number) => void;
  setMarketPrices: (prices: Record<string, number>) => void;
  refreshPrices: (symbols?: string[]) => Promise<void>;
  exportData: () => string;
  importData: (json: string) => boolean;
  clearAllTransactions: () => void;
  clearPortfolioTransactions: (portfolioId: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

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
      const configured = await checkCloudConfigured();
      if (cancelled) return;

      const room = getSyncRoomId();
      setSyncRoom(room);
      setCloudConfigured(configured);

      const local = loadState();

      if (!configured) {
        setState(local);
        setActivePortfolioId(local.portfolios[0]?.id ?? "default");
        setHydrated(true);
        return;
      }

      const remote = await loadRemoteState(room);
      if (cancelled) return;

      if (remote) {
        lastRemoteUpdatedAt.current = remote.updatedAt;
        setState(remote.state);
        saveState(remote.state);
        setActivePortfolioId(remote.state.portfolios[0]?.id ?? "default");
      } else {
        setState(local);
        setActivePortfolioId(local.portfolios[0]?.id ?? "default");
        if (local.transactions.length > 0 || local.portfolios.length > 1) {
          const ts = await saveRemoteState(room, local);
          if (ts) lastRemoteUpdatedAt.current = ts;
        }
      }

      setHydrated(true);
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
      if (isPolling.current) return;
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

    const id = setInterval(poll, 20_000);
    return () => clearInterval(id);
  }, [hydrated, cloudConfigured, syncRoom]);

  const stats = useMemo(
    () =>
      computePortfolioStats(
        state.transactions,
        activePortfolioId,
        state.marketPrices
      ),
    [state.transactions, state.marketPrices, activePortfolioId]
  );

  const holdingSymbols = useMemo(
    () => stats.holdings.map((h) => h.symbol),
    [stats.holdings]
  );

  const refreshPrices = useCallback(async (symbols?: string[]) => {
    const list = symbols ?? holdingSymbols;
    if (list.length === 0) return;

    setPriceLoading(true);
    setQuoteUnresolved([]);
    try {
      const res = await fetch(`/api/quotes?symbols=${list.join(",")}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? `Không lấy được giá (HTTP ${res.status})`);
        return;
      }
      const quotes: {
        symbol: string;
        price: number;
        change?: number;
        changePercent?: number;
        shortName?: string;
      }[] = data.quotes ?? [];

      setState((s) => {
        const marketPrices = { ...s.marketPrices, ...data.prices };
        const marketQuotes = { ...(s.marketQuotes ?? {}) };
        for (const q of quotes) {
          if (q.price > 0) {
            marketPrices[q.symbol] = q.price;
            marketQuotes[q.symbol] = {
              price: q.price,
              change: q.change ?? 0,
              changePercent: q.changePercent ?? 0,
              name: q.shortName,
            };
          }
        }
        return {
          ...s,
          marketPrices,
          marketQuotes,
          pricesUpdatedAt: data.updatedAt ?? new Date().toISOString(),
        };
      });
      setQuoteUnresolved(data.unresolved ?? []);
      if (data.providers?.finnhubHint && !data.providers?.finnhub) {
        console.warn(data.providers.finnhubHint);
      }
    } finally {
      setPriceLoading(false);
    }
  }, [holdingSymbols]);

  useEffect(() => {
    if (!hydrated || holdingSymbols.length === 0) return;
    const stale =
      !state.pricesUpdatedAt ||
      Date.now() - new Date(state.pricesUpdatedAt).getTime() > 5 * 60 * 1000;
    if (stale) refreshPrices(holdingSymbols);
  }, [hydrated, holdingSymbols.join(","), refreshPrices, state.pricesUpdatedAt]);

  const addPortfolio = useCallback((name: string, currency: string) => {
    const portfolio: Portfolio = {
      id: uuid(),
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
      transactions: [...s.transactions, { ...tx, id: uuid() }],
    }));
  }, []);

  const importTransactions = useCallback((txs: Omit<Transaction, "id">[]) => {
    setState((s) => ({
      ...s,
      transactions: [
        ...s.transactions,
        ...txs.map((tx) => ({ ...tx, id: uuid() })),
      ],
    }));
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
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

  const exportData = useCallback(() => JSON.stringify(state, null, 2), [state]);

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

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef0f3] text-gray-500">
        Đang tải...
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        state,
        activePortfolioId,
        setActivePortfolioId,
        stats,
        priceLoading,
        quoteUnresolved,
        cloudConfigured,
        syncRoom,
        addPortfolio,
        addTransaction,
        importTransactions,
        deleteTransaction,
        setMarketPrice,
        setMarketPrices,
        refreshPrices,
        exportData,
        importData,
        clearAllTransactions,
        clearPortfolioTransactions,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
