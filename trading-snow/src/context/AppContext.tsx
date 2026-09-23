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
import {
  annotateTransactions,
  currentUsdRate,
  needsFxAnnotation,
  symbolCurrencies,
  toUsdPrices,
  toUsdQuotes,
  toUsdTransactions,
} from "@/lib/fx";
import { hiddenSymbolSet } from "@/lib/hidden-symbols";
import {
  checkCloudConfigured,
  getSyncRoomId,
  loadRemoteState,
  loadSyncBase,
  saveRemoteState,
  saveSyncBase,
} from "@/lib/remote-storage";
import {
  emptySyncBase,
  isBlankState,
  localOnlyTransactionCount,
  mergeSyncedState,
  sameSyncedContent,
  syncBaseOf,
  type SyncBase,
} from "@/lib/sync-merge";
import { fetchFxLookup } from "@/lib/fx-client";
import { QUOTE_BATCH_SIZE } from "@/lib/quote-providers";
import { sanitizeAppState } from "@/lib/sanitize-state";
import { defaultState, loadState, saveState } from "@/lib/storage";
import { filterDuplicateTransactions } from "@/lib/transaction-dedup";
import { toast } from "@/lib/toast-store";
import type {
  AppState,
  MarketQuote,
  MarketSession,
  Portfolio,
  PortfolioStats,
  Transaction,
} from "@/lib/types";

const PRICE_REFRESH_MS = 5 * 60 * 1000;

interface AppContextValue {
  /** Đã đọc xong dữ liệu trong máy — trước đó state là bản trống mặc định. */
  hydrated: boolean;
  /** Dữ liệu gốc: giá/lệnh theo tiền tệ niêm yết (EUR cho mã .PA…). */
  state: AppState;
  /** Cùng dữ liệu đó quy ra USD — dùng cho mọi số tiền hiển thị trong danh mục. */
  usd: {
    transactions: Transaction[];
    marketPrices: Record<string, number>;
    marketQuotes: Record<string, MarketQuote>;
  };
  /** Số USD cho 1 đơn vị giá niêm yết của mã theo tỷ giá hiện tại (1 với mã Mỹ). */
  usdRate: (symbol: string) => number;
  /** Tiền tệ niêm yết của mã (USD khi chưa biết). */
  currencyOf: (symbol: string) => string;
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
  // Chỉ đẩy lên cloud sau khi đã nhận (hoặc gộp) bản cloud lúc mở app — trước đó state
  // local có thể là bản cũ/trống và sẽ đè lên dữ liệu thật.
  const [cloudReady, setCloudReady] = useState(false);
  const [syncRoom, setSyncRoom] = useState("shared");

  // Bản cloud gần nhất mà state ở máy này dựa vào — để gộp khi máy khác cũng vừa đổi.
  const syncBaseRef = useRef<SyncBase | null>(null);
  // State đã khớp cloud (vừa nhận về hoặc vừa lưu xong) thì không đẩy lại: trước đây mỗi
  // lần poll nhận bản mới lại ghi ngược lên cloud, hai máy cùng mở ghi đè nhau mỗi 20 giây.
  const syncedStateRef = useRef<AppState | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSaving = useRef(false);
  const isPolling = useRef(false);

  const rememberSyncBase = useCallback((base: SyncBase) => {
    syncBaseRef.current = base;
    saveSyncBase(base);
  }, []);

  const syncBaseFor = useCallback(
    (room: string) => (syncBaseRef.current?.room === room ? syncBaseRef.current : null),
    []
  );

  /**
   * Nhận bản cloud. Có `base` thì gộp với thay đổi chưa đồng bộ ở máy này (giữ lệnh
   * thêm ở cả hai bên, bỏ lệnh một bên đã xóa); không có thì cloud thắng như trước.
   */
  const applyRemoteState = useCallback(
    (room: string, remote: { state: AppState; updatedAt: string }, base: SyncBase | null) => {
      setState((current) => {
        const merged = base ? mergeSyncedState(base, current, remote.state) : remote.state;
        if (merged === remote.state || sameSyncedContent(merged, remote.state)) {
          syncedStateRef.current = remote.state;
          return remote.state;
        }
        return merged;
      });
      rememberSyncBase(syncBaseOf(room, remote.updatedAt, remote.state));
    },
    [rememberSyncBase]
  );

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

      const stored = loadSyncBase();
      syncBaseRef.current = stored?.room === room ? stored : null;

      const loaded = await loadRemoteState(room);
      if (cancelled) return;
      const remote = loaded && "state" in loaded ? loaded : null;

      if (remote) {
        const base = syncBaseFor(room);
        if (base || isBlankState(local)) {
          // Có base thì thay đổi lưu local nhưng chưa kịp đẩy lên (mất mạng, đóng tab)
          // được gộp vào; máy trống thì nhận nguyên bản cloud.
          applyRemoteState(room, remote, base);
        } else {
          // Máy có dữ liệu nhưng chưa từng đồng bộ phòng này: không biết lệnh nào đã bị
          // xóa ở máy khác, nên giữ cả hai bên thay vì để cloud xóa sạch dữ liệu máy này.
          const extra = localOnlyTransactionCount(local, remote.state);
          applyRemoteState(room, remote, emptySyncBase(room));
          if (extra > 0) {
            toast.info(`Đã gộp ${extra} giao dịch chỉ có trên máy này vào dữ liệu cloud`, {
              description: "Nếu trong đó có lệnh đã xóa ở máy khác, hãy xóa lại.",
              duration: 12_000,
            });
          }
        }
        setActivePortfolioId(remote.state.portfolios[0]?.id ?? "default");
      } else if (!isBlankState(local)) {
        const base = emptySyncBase(room);
        const result = await saveRemoteState(room, local, base.updatedAt);
        if (cancelled) return;
        if (result.status === "saved") {
          syncedStateRef.current = local;
          rememberSyncBase(syncBaseOf(room, result.updatedAt, local));
        } else if (result.status === "conflict") {
          applyRemoteState(room, result, base);
        }
      }
      setCloudReady(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [applyRemoteState, rememberSyncBase, syncBaseFor]);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state);

    if (!cloudConfigured || !cloudReady || state === syncedStateRef.current) return;
    // Máy trống chưa từng đồng bộ không đẩy bản rỗng lên: máy có dữ liệu mở sau sẽ bị
    // bản rỗng đó "thắng" và mất sạch.
    if (!syncBaseFor(syncRoom) && isBlankState(state)) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      isSaving.current = true;
      try {
        // Chưa từng đồng bộ phòng này: coi như cloud trống, lỡ có máy khác vừa tạo thì
        // gộp hợp (không xóa gì) thay vì ghi đè.
        const base = syncBaseFor(syncRoom) ?? emptySyncBase(syncRoom);
        const result = await saveRemoteState(syncRoom, state, base.updatedAt);
        if (result.status === "saved") {
          syncedStateRef.current = state;
          rememberSyncBase(syncBaseOf(syncRoom, result.updatedAt, state));
        } else if (result.status === "conflict") {
          applyRemoteState(syncRoom, result, base);
        }
      } finally {
        isSaving.current = false;
      }
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [
    state,
    hydrated,
    cloudConfigured,
    cloudReady,
    syncRoom,
    applyRemoteState,
    rememberSyncBase,
    syncBaseFor,
  ]);

  useEffect(() => {
    if (!hydrated || !cloudConfigured || !cloudReady) return;

    const poll = async () => {
      // Đang chờ/đang lưu thì để lượt lưu tự xử lý xung đột, poll lúc này chỉ gây đua.
      if (isPolling.current || isSaving.current || saveTimer.current || document.hidden) return;
      isPolling.current = true;
      try {
        const base = syncBaseFor(syncRoom);
        const remote = await loadRemoteState(syncRoom, base?.updatedAt);
        if (!remote || !("state" in remote) || remote.updatedAt === base?.updatedAt) return;
        applyRemoteState(syncRoom, remote, base);
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
  }, [hydrated, cloudConfigured, cloudReady, syncRoom, applyRemoteState, syncBaseFor]);

  const hiddenSymbols = useMemo(
    () => hiddenSymbolSet(state.hiddenSymbols?.[activePortfolioId]),
    [state.hiddenSymbols, activePortfolioId]
  );

  // Mọi phép tính chạy trên bản USD: giá vốn theo tỷ giá ngày giao dịch, giá thị trường
  // theo tỷ giá hiện tại. Trước đây giá EUR của mã .PA được cộng thẳng như USD.
  const currencies = useMemo(
    () =>
      symbolCurrencies({ transactions: state.transactions, marketQuotes: state.marketQuotes }),
    [state.transactions, state.marketQuotes]
  );
  const usd = useMemo(
    () => ({
      transactions: toUsdTransactions(state.transactions, state.fxRates),
      marketPrices: toUsdPrices(state.marketPrices, currencies, state.fxRates),
      marketQuotes: toUsdQuotes(state.marketQuotes ?? {}, currencies, state.fxRates),
    }),
    [state.transactions, state.marketPrices, state.marketQuotes, state.fxRates, currencies]
  );
  const usdRate = useCallback(
    (symbol: string) => currentUsdRate(currencies[symbol], state.fxRates) ?? 1,
    [currencies, state.fxRates]
  );
  const currencyOf = useCallback((symbol: string) => currencies[symbol] ?? "USD", [currencies]);

  const stats = useMemo(
    () =>
      computePortfolioStats(
        usd.transactions,
        activePortfolioId,
        usd.marketPrices,
        usd.marketQuotes,
        hiddenSymbols
      ),
    [usd, activePortfolioId, hiddenSymbols]
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
        currency?: string;
      }[] = [];
      const mergedFx: Record<string, number> = {};
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
              currency?: string;
            }[];
            fx?: Record<string, number>;
            unresolved?: string[];
            truncated?: boolean;
          };
        })
      );

      for (const data of batchResults) {
        Object.assign(mergedPrices, data.prices ?? {});
        mergedQuotes.push(...(data.quotes ?? []));
        Object.assign(mergedFx, data.fx ?? {});
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
              currency: q.currency,
            };
          }
        }
        return {
          ...s,
          marketPrices,
          marketQuotes,
          fxRates: { ...(s.fxRates ?? {}), ...mergedFx },
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

  // Tự lấy giá mỗi 5 phút khi tab đang mở, và ngay khi có mã mới chưa có giá. Trước
  // đây chỉ kiểm tra lúc mở app nên để trang mở lâu thì giá đứng yên.
  const holdingSymbolsKey = holdingSymbols.join(",");
  const autoRefreshing = useRef(false);

  useEffect(() => {
    if (!hydrated || !holdingSymbolsKey) return;

    const refreshIfStale = async () => {
      if (autoRefreshing.current || document.hidden) return;
      const current = stateRef.current;
      const { pricesUpdatedAt, marketPrices } = current;
      const symbols = holdingSymbolsRef.current;
      const listed = symbolCurrencies(current);
      const stale =
        !pricesUpdatedAt ||
        Date.now() - new Date(pricesUpdatedAt).getTime() > PRICE_REFRESH_MS ||
        symbols.some((s) => marketPrices[s] == null) ||
        // Mã ngoại tệ mà chưa có tỷ giá: lấy ngay, đừng để giá EUR hiện như USD tới 5 phút.
        symbols.some((s) => currentUsdRate(listed[s], current.fxRates) == null);
      if (!stale) return;
      autoRefreshing.current = true;
      try {
        await refreshPrices(symbols);
      } finally {
        autoRefreshing.current = false;
      }
    };

    const onVisible = () => {
      if (!document.hidden) void refreshIfStale();
    };

    // Lùi một nhịp: refreshPrices bật trạng thái loading ngay khi chạy.
    const first = globalThis.setTimeout(() => void refreshIfStale(), 0);
    const id = globalThis.setInterval(() => void refreshIfStale(), 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      globalThis.clearTimeout(first);
      globalThis.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated, holdingSymbolsKey, refreshPrices]);

  // Gắn tiền tệ niêm yết và tỷ giá ngày giao dịch cho lệnh còn thiếu (lệnh cũ, lệnh vừa
  // nhập tay/import, lệnh từ máy khác). Mỗi nhóm lệnh chỉ hỏi server một lần mỗi phiên.
  const fxAttempted = useRef(new Set<string>());

  useEffect(() => {
    if (!hydrated) return;
    const pending = state.transactions.filter(needsFxAnnotation);
    if (pending.length === 0) return;
    const key = pending
      .map((t) => t.id)
      .sort()
      .join(",");
    const attempted = fxAttempted.current;
    if (attempted.has(key)) return;
    attempted.add(key);

    let cancelled = false;
    const symbols = [...new Set(pending.map((t) => t.symbol.toUpperCase()))];
    const firstDay = pending
      .reduce((min, t) => (t.date < min ? t.date : min), pending[0].date)
      .slice(0, 10);
    const from = new Date(Date.parse(firstDay) - 7 * 86_400_000).toISOString().slice(0, 10);

    fetchFxLookup(symbols, from)
      .then((lookup) => {
        if (!cancelled) setState((s) => annotateTransactions(s, lookup));
      })
      .catch(() => {
        // Mất mạng / Yahoo lỗi: tạm quy đổi theo tỷ giá hiện tại, lần mở app sau thử lại.
      });

    return () => {
      // Bị hủy giữa chừng (lệnh đổi trước khi server trả lời) thì cho lượt sau hỏi lại.
      cancelled = true;
      attempted.delete(key);
    };
  }, [hydrated, state.transactions]);

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
      const parsed = sanitizeAppState(JSON.parse(json));
      if (!parsed) return false;
      setState(parsed.state);
      setActivePortfolioId(parsed.state.portfolios[0]?.id ?? "default");
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
      hydrated,
      state,
      usd,
      usdRate,
      currencyOf,
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
      hydrated,
      state,
      usd,
      usdRate,
      currencyOf,
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
