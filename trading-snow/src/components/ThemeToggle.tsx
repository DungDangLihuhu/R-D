"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="app-btn-secondary flex h-9 w-9 items-center justify-center p-0"
      title={isDark ? "Chuyển sang sáng" : "Chuyển sang tối"}
      aria-label={isDark ? "Bật giao diện sáng" : "Bật giao diện tối"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4" style={{ color: "var(--app-text-muted)" }} />
      )}
    </button>
  );
}
