"use client";

import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";

/** Recharts cần mã màu cụ thể (không đọc được CSS variable) — giữ khớp với token trong globals.css. */
export function useChartTheme() {
  const { theme } = useTheme();

  return useMemo(
    () =>
      theme === "dark"
        ? {
            accent: "#8f92f5",
            grid: "#262a38",
            tick: "#989eb1",
            tooltip: {
              background: "#171923",
              border: "1px solid #323648",
              borderRadius: "8px",
              color: "#f2f3f7",
              boxShadow: "0 14px 36px -10px rgba(0,0,0,0.7)",
            },
          }
        : {
            accent: "#5457d7",
            grid: "#e9ebf0",
            tick: "#6b7183",
            tooltip: {
              background: "#ffffff",
              border: "1px solid #e4e6ed",
              borderRadius: "8px",
              color: "#14161d",
              boxShadow: "0 10px 28px -8px rgba(20,22,29,0.16)",
            },
          },
    [theme]
  );
}
