import type { AppState } from "./types";

const STORAGE_KEY = "trading-snow-state-v1";

export const defaultState = (): AppState => ({
  portfolios: [
    {
      id: "default",
      name: "Portfolio chính",
      currency: "USD",
      createdAt: new Date().toISOString(),
    },
  ],
  transactions: [],
  marketPrices: {},
  pricesUpdatedAt: null,
});

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
