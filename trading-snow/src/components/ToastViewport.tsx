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

// Chấm màu là tín hiệu duy nhất cho loại thông báo — nền, viền, chữ dùng chung
// một kiểu để chồng nhiều toast không thành một mảng màu.
const VARIANT_DOT: Record<ToastVariant, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-brand",
  event: "bg-violet-500",
};

function ToastCard({ item }: { item: ToastItem }) {
  const body = (
    <div className="app-popover pointer-events-auto flex w-full max-w-sm gap-3 rounded-xl p-3">
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${VARIANT_DOT[item.variant]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-app-text">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs text-app-muted">{item.description}</p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismissToast(item.id);
            }}
            className="mt-1.5 text-xs font-semibold text-brand-ink underline underline-offset-2 hover:decoration-2"
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
