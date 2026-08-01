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
    <div className="min-h-screen overflow-x-hidden bg-[#eef0f3] text-gray-900">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900">
            <Snowflake className="h-5 w-5 shrink-0 text-sky-600" />
            <span>Trading Snow</span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activePortfolioId}
              onChange={(e) => setActivePortfolioId(e.target.value)}
              className="max-w-[min(100%,14rem)] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm"
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
        <nav className="mx-auto grid max-w-6xl grid-cols-3 gap-1 px-4 pb-2 sm:flex sm:flex-wrap">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === "/events" && pathname === "/dividends") ||
              (href === "/stock" && pathname.startsWith("/stock"));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition sm:justify-start sm:px-3 sm:text-sm ${
                  active
                    ? "bg-sky-100 text-sky-700"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl min-w-0 px-4 py-6">{children}</main>
    </div>
  );
}
