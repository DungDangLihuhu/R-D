"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  dismissToast,
  subscribeToasts,
  type ToastItem,
  type ToastVariant,
} from "@/lib/toast-store";

const VARIANT_STYLE: Record<
  ToastVariant,
  { border: string; icon: string; title: string; glow: string }
> = {
  success: {
    border: "border-emerald-200/80",
    icon: "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
    title: "text-emerald-900",
    glow: "shadow-[0_8px_32px_-8px_rgba(16,185,129,0.35)]",
  },
  error: {
    border: "border-rose-200/80",
    icon: "bg-gradient-to-br from-rose-400 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.45)]",
    title: "text-rose-900",
    glow: "shadow-[0_8px_32px_-8px_rgba(244,63,94,0.3)]",
  },
  warning: {
    border: "border-amber-200/80",
    icon: "bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.45)]",
    title: "text-amber-900",
    glow: "shadow-[0_8px_32px_-8px_rgba(245,158,11,0.3)]",
  },
  info: {
    border: "border-sky-200/80",
    icon: "bg-gradient-to-br from-sky-400 to-cyan-500 shadow-[0_0_10px_rgba(56,189,248,0.5)]",
    title: "text-sky-900",
    glow: "shadow-[0_8px_32px_-8px_rgba(56,189,248,0.35)]",
  },
  event: {
    border: "border-violet-200/80",
    icon: "bg-gradient-to-br from-violet-400 to-violet-600 shadow-[0_0_10px_rgba(139,92,246,0.45)]",
    title: "text-violet-900",
    glow: "shadow-[0_8px_32px_-8px_rgba(139,92,246,0.3)]",
  },
};

function ToastCard({ item }: { item: ToastItem }) {
  const style = VARIANT_STYLE[item.variant];

  const body = (
    <div
      className={`pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border p-3 backdrop-blur-md ${style.border} ${style.glow}`}
      style={{
        background: "var(--app-surface-glass)",
        borderColor: "var(--app-border-glass)",
      }}
    >
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.icon}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${style.title}`}>{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {item.description}
          </p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismissToast(item.id);
            }}
            className="mt-1.5 text-xs font-semibold text-sky-600 underline underline-offset-2 hover:text-sky-700"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="shrink-0 rounded p-1 text-app-muted transition-colors hover:text-app-text"
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block"
        onClick={() => dismissToast(item.id)}
      >
        {body}
      </Link>
    );
  }

  return body;
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
      aria-live="polite"
      aria-label="Thông báo"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
