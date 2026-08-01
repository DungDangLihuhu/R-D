"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  History,
  LayoutDashboard,
  LineChart,
  Snowflake,
  Wallet,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SyncBadge } from "@/components/SyncPanel";

const nav = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/trades", label: "Giao dịch", icon: Wallet },
  { href: "/portfolio", label: "Danh mục", icon: LineChart },
  { href: "/closed", label: "Lệnh đóng", icon: History },
  { href: "/dividends", label: "Cổ tức", icon: CalendarDays },
  { href: "/analytics", label: "Thống kê", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, activePortfolioId, setActivePortfolioId, cloudConfigured } = useApp();

  return (
    <div className="min-h-screen bg-[#eef0f3] text-gray-900">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900">
            <Snowflake className="h-5 w-5 text-sky-600" />
            <span>Trading Snow</span>
          </Link>
          <select
            value={activePortfolioId}
            onChange={(e) => setActivePortfolioId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            {state.portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SyncBadge configured={cloudConfigured} />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sky-100 text-sky-700"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
