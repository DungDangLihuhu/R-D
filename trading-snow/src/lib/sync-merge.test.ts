import { describe, expect, it } from "vitest";
import {
  isBlankState,
  localOnlyTransactionCount,
  mergeSyncedState,
  sameSyncedContent,
  syncBaseOf,
} from "./sync-merge";
import type { AppState, Transaction } from "./types";

function tx(id: string): Transaction {
  return {
    id,
    portfolioId: "p",
    type: "BUY",
    symbol: "AAPL",
    assetType: "STOCK",
    quantity: 1,
    price: 100,
    fee: 0,
    date: "2025-01-02",
  };
}

function state(ids: string[], extra: Partial<AppState> = {}): AppState {
  return {
    portfolios: [{ id: "p", name: "Chính", currency: "USD", createdAt: "2025-01-01" }],
    transactions: ids.map(tx),
    marketPrices: {},
    ...extra,
  };
}

const ids = (s: AppState) => s.transactions.map((t) => t.id);

describe("mergeSyncedState", () => {
  const base = syncBaseOf("room", "v1", state(["a", "b"]));

  it("keeps trades added on both devices since the last sync", () => {
    const merged = mergeSyncedState(base, state(["a", "b", "mine"]), state(["a", "b", "theirs"]));
    expect(ids(merged)).toEqual(["a", "b", "theirs", "mine"]);
  });

  it("drops a trade deleted on either device instead of bringing it back", () => {
    const merged = mergeSyncedState(base, state(["b"]), state(["a"]));
    expect(ids(merged)).toEqual([]);
  });

  it("equals the remote state when this device changed nothing", () => {
    const remote = state(["a", "c"], { marketPrices: { AAPL: 120 }, pricesUpdatedAt: "2025-02-01" });
    const merged = mergeSyncedState(base, state(["a", "b"]), remote);
    expect(sameSyncedContent(merged, remote)).toBe(true);
  });

  it("takes prices from whichever device refreshed last", () => {
    const local = state(["a", "b"], { marketPrices: { AAPL: 130, MSFT: 400 }, pricesUpdatedAt: "2025-03-01" });
    const remote = state(["a", "b"], { marketPrices: { AAPL: 120, TSLA: 200 }, pricesUpdatedAt: "2025-02-01" });
    expect(mergeSyncedState(base, local, remote).marketPrices).toEqual({ AAPL: 130, MSFT: 400, TSLA: 200 });
  });

  it("keeps the hidden-symbol list from the device that changed it", () => {
    const withHidden = syncBaseOf("room", "v1", state(["a"], { hiddenSymbols: { p: ["AAPL"] } }));
    const local = state(["a"], { hiddenSymbols: { p: [] } });
    const remote = state(["a"], { hiddenSymbols: { p: ["AAPL"] } });
    expect(mergeSyncedState(withHidden, local, remote).hiddenSymbols).toEqual({});
  });
});

describe("sameSyncedContent", () => {
  it("ignores key order and empty-vs-missing fields", () => {
    const a = state(["a"], { marketPrices: { B: 2, A: 1 } });
    const b = state(["a"], { marketPrices: { A: 1, B: 2 }, marketQuotes: {}, hiddenSymbols: { p: [] } });
    expect(sameSyncedContent(a, b)).toBe(true);
  });
});

describe("first sync of a device", () => {
  it("treats a fresh device as blank so it never overwrites the cloud with nothing", () => {
    expect(isBlankState(state([]))).toBe(true);
    expect(isBlankState(state(["a"]))).toBe(false);
  });

  it("counts trades that exist only on this device", () => {
    expect(localOnlyTransactionCount(state(["a", "b", "x"]), state(["a", "b"]))).toBe(1);
  });
});
