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
  { border: string; icon: string; title: string }
> = {
  success: {
    border: "border-emerald-200",
    icon: "bg-emerald-500",
    title: "text-emerald-900",
  },
  error: {
    border: "border-rose-200",
    icon: "bg-rose-500",
    title: "text-rose-900",
  },
  warning: {
    border: "border-amber-200",
    icon: "bg-amber-500",
    title: "text-amber-900",
  },
  info: {
    border: "border-sky-200",
    icon: "bg-sky-500",
    title: "text-sky-900",
  },
  event: {
    border: "border-violet-200",
    icon: "bg-violet-500",
    title: "text-violet-900",
  },
};

function ToastCard({ item }: { item: ToastItem }) {
  const style = VARIANT_STYLE[item.variant];

  const body = (
    <div
      className={`pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl border bg-white/95 p-3 shadow-xl backdrop-blur-sm ${style.border}`}
    >
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.icon}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${style.title}`}>{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
