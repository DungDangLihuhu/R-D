import type { AppState } from "./types";
import { sanitizeAppState } from "./sanitize-state";

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
  hiddenSymbols: {},
});

export function loadState(): AppState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeAppState(JSON.parse(raw))?.state ?? defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Hết quota hoặc trình duyệt chặn storage: giữ state trong bộ nhớ, không làm sập app.
  }
}

/** Tải nguyên dữ liệu đang lưu trong máy về file JSON — cứu dữ liệu khi app gặp lỗi. */
export function downloadLocalBackup(): void {
  if (typeof window === "undefined") return;
  let raw = "{}";
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    // Storage bị chặn: vẫn tải file rỗng để người dùng biết không có gì để cứu.
  }
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `trading-snow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
