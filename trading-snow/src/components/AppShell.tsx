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
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <div className="app-bg-mesh min-h-screen overflow-x-hidden text-app-text">
      <header className="app-header">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/"
            className="group flex items-center gap-2.5 font-semibold text-app-text transition-opacity hover:opacity-90"
          >
            <span className="app-logo-glow transition-transform duration-300 group-hover:scale-105">
              <Snowflake className="h-4 w-4" />
            </span>
            <span className="app-brand-text tracking-tight">
              Trading Snow
            </span>
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
            <ThemeToggle />
            <SyncBadge configured={cloudConfigured} />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-none">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === "/events" && pathname === "/dividends") ||
              (href === "/stock" && pathname.startsWith("/stock"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? "app-nav-active" : "app-nav-inactive"
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
