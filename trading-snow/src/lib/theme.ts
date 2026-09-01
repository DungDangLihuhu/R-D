export type Theme = "light" | "dark";

const STORAGE_KEY = "trading-snow-theme";
const listeners = new Set<() => void>();

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore quota errors
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  listeners.forEach((fn) => fn());
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? (prefersDark() ? "dark" : "light");
}

/**
 * `<html data-theme>` là nguồn sự thật — script trong <head> đặt nó trước khi React
 * hydrate, nên server và client không bao giờ lệch nhau.
 */
export function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function getThemeServerSnapshot(): Theme {
  return "light";
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const followSystem = () => {
    if (!getStoredTheme()) applyTheme(prefersDark() ? "dark" : "light");
  };
  media.addEventListener("change", followSystem);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", followSystem);
  };
}
