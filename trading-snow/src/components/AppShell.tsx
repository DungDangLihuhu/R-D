"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  History,
  LayoutDashboard,
  LineChart,
  Microscope,
  Snowflake,
  Wallet,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { NotificationWatcher } from "@/components/NotificationWatcher";
import { SyncBadge } from "@/components/SyncPanel";

const nav = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/trades", label: "Giao dịch", icon: Wallet },
  { href: "/portfolio", label: "Danh mục", icon: LineChart },
  { href: "/closed", label: "Lệnh đóng", icon: History },
  { href: "/events", label: "Sự kiện", icon: CalendarDays },
  { href: "/stock", label: "Phân tích", icon: Microscope },
  { href: "/analytics", label: "Thống kê", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, activePortfolioId, setActivePortfolioId, cloudConfigured } = useApp();

  return (
    <div className="min-h-screen overflow-x-hidden bg-app-bg text-gray-900">
      <header className="sticky top-0 z-50 border-b border-app-border bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold text-gray-900 transition-opacity hover:opacity-80"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-700 shadow-sm">
              <Snowflake className="h-4 w-4 text-white" />
            </span>
            <span className="tracking-tight">Trading Snow</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activePortfolioId}
              onChange={(e) => setActivePortfolioId(e.target.value)}
              className="app-input max-w-[min(100%,14rem)] py-1.5"
            >
              {state.portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <SyncBadge configured={cloudConfigured} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2.5 scrollbar-none">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === "/events" && pathname === "/dividends") ||
              (href === "/stock" && pathname.startsWith("/stock"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-white hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl min-w-0 px-4 py-6 sm:py-8">{children}</main>
      <NotificationWatcher />
    </div>
  );
}
