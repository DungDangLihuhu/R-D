export type ToastVariant = "success" | "error" | "warning" | "info" | "event";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  href?: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  href?: string;
}

export function showToast(opts: ToastOptions) {
  const item: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: opts.title,
    description: opts.description,
    variant: opts.variant ?? "info",
    duration: opts.duration ?? (opts.variant === "event" ? 8000 : 5000),
    href: opts.href,
  };
  toasts = [...toasts.slice(-4), item];
  emit();

  if (item.duration > 0) {
    setTimeout(() => dismissToast(item.id), item.duration);
  }
}

export const toast = {
  show: showToast,
  success: (title: string, opts?: Omit<ToastOptions, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "success" }),
  error: (title: string, opts?: Omit<ToastOptions, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "error" }),
  warning: (title: string, opts?: Omit<ToastOptions, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "warning" }),
  info: (title: string, opts?: Omit<ToastOptions, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "info" }),
  event: (title: string, opts?: Omit<ToastOptions, "title" | "variant">) =>
    showToast({ ...opts, title, variant: "event", href: opts?.href ?? "/events" }),
};
