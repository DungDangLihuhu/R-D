"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { v4 as uuid } from "uuid";
import { computePortfolioStats } from "@/lib/stats";
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
  addPortfolio: (name: string, currency: string) => void;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  importTransactions: (txs: Omit<Transaction, "id">[]) => void;
  deleteTransaction: (id: string) => void;
  setMarketPrice: (symbol: string, price: number) => void;
  setMarketPrices: (prices: Record<string, number>) => void;
  refreshPrices: (symbols?: string[]) => Promise<void>;
  exportData: () => string;
  importData: (json: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [activePortfolioId, setActivePortfolioId] = useState("default");
  const [hydrated, setHydrated] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded);
    setActivePortfolioId(loaded.portfolios[0]?.id ?? "default");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

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
    try {
      const res = await fetch(`/api/quotes?symbols=${list.join(",")}`);
      if (!res.ok) return;
      const data = await res.json();
      setState((s) => ({
        ...s,
        marketPrices: { ...s.marketPrices, ...data.prices },
        pricesUpdatedAt: data.updatedAt ?? new Date().toISOString(),
      }));
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

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
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
        addPortfolio,
        addTransaction,
        importTransactions,
        deleteTransaction,
        setMarketPrice,
        setMarketPrices,
        refreshPrices,
        exportData,
        importData,
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
