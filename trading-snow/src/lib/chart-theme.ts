"use client";

import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";

export function useChartTheme() {
  const { theme } = useTheme();

  return useMemo(
    () =>
      theme === "dark"
        ? {
            grid: "#334155",
            tick: "#94a3b8",
            tooltip: {
              background: "#1e293b",
              border: "1px solid #475569",
              borderRadius: "10px",
              color: "#f8fafc",
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            },
          }
        : {
            grid: "#e2e8f0",
            tick: "#64748b",
            tooltip: {
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              color: "#0f172a",
              boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
            },
          },
    [theme]
  );
}
