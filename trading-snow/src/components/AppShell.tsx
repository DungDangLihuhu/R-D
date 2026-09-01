"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  History,
  LayoutDashboard,
  LineChart,
  Microscope,
  Radio,
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
  { href: "/signals", label: "Tín hiệu", icon: Radio },
  { href: "/analytics", label: "Thống kê", icon: BarChart3 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, activePortfolioId, setActivePortfolioId, cloudConfigured } = useApp();
  const navRef = useRef<HTMLElement>(null);
  const navWrapRef = useRef<HTMLDivElement>(null);

  // Nav cuộn ngang mà không có scrollbar: bật mép mờ khi còn mục bị khuất,
  // và luôn kéo mục đang mở vào tầm nhìn.
  useEffect(() => {
    const el = navRef.current;
    const wrap = navWrapRef.current;
    if (!el || !wrap) return;

    const update = () => {
      const hidden = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
      wrap.dataset.overflow = String(hidden);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    el.querySelector("[data-active='true']")?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <div className="app-bg-mesh flex min-h-screen flex-col overflow-x-hidden text-app-text">
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
            <label className="relative">
              <span className="sr-only">Chọn portfolio</span>
              <Briefcase className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-muted" />
              <select
                value={activePortfolioId}
                onChange={(e) => setActivePortfolioId(e.target.value)}
                className="app-input max-w-[min(100%,14rem)] py-1.5 pl-8"
              >
                {state.portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <ThemeToggle />
            <SyncBadge configured={cloudConfigured} />
          </div>
        </div>
        <div ref={navWrapRef} className="app-nav-scroller mx-auto max-w-6xl">
          <nav
            ref={navRef}
            className="flex gap-1 overflow-x-auto px-4 pb-3 scrollbar-none"
          >
            {nav.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href ||
                (href === "/events" && pathname === "/dividends") ||
                (href === "/stock" && pathname.startsWith("/stock"));
              return (
                <Link
                  key={href}
                  href={href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 sm:py-8">
        {children}
      </main>
      <footer className="app-footer mt-auto">
        <p className="mx-auto max-w-6xl px-4 py-5 text-center text-xs leading-relaxed">
          Trading Snow · nhật ký giao dịch cá nhân · dữ liệu thị trường chỉ mang tính tham khảo
        </p>
      </footer>
      <NotificationWatcher />
    </div>
  );
}
