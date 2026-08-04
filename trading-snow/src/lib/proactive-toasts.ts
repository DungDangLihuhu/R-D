import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { fetchJson } from "@/lib/fetch-cache";
import { toast } from "@/lib/toast-store";
import type { CalendarEvent, MarketQuote } from "@/lib/types";

const SHOWN_KEY = "trading-snow-toasts-shown";
const PRICE_MOVE_THRESHOLD = 5;

function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function loadShown(): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markShown(key: string) {
  if (typeof sessionStorage === "undefined") return;
  const set = loadShown();
  set.add(key);
  const list = [...set].slice(-200);
  sessionStorage.setItem(SHOWN_KEY, JSON.stringify(list));
}

function showOnce(key: string, fn: () => void) {
  if (loadShown().has(key)) return;
  markShown(key);
  fn();
}

function relativeDayLabel(dateStr: string): string {
  const diff = differenceInCalendarDays(parseISO(dateStr), new Date());
  if (diff === 0) return "hôm nay";
  if (diff === 1) return "ngày mai";
  return format(parseISO(dateStr), "dd/MM", { locale: vi });
}

export function notifyPriceMoves(
  quotes: Record<string, MarketQuote>,
  symbols: string[]
) {
  const day = todayStr();
  for (const symbol of symbols) {
    const q = quotes[symbol];
    if (!q || Math.abs(q.changePercent) < PRICE_MOVE_THRESHOLD) continue;

    const dir = q.changePercent > 0 ? "up" : "down";
    const key = `price:${symbol}:${day}:${dir}`;
    showOnce(key, () => {
      const sign = q.changePercent > 0 ? "+" : "";
      toast.event(`${symbol} ${sign}${q.changePercent.toFixed(1)}% hôm nay`, {
        description: q.name ?? "Biến động giá lớn trong danh mục",
      });
    });
  }
}

function toastForEvent(event: CalendarEvent, holdingSymbols: Set<string>) {
  const day = todayStr();
  const when = relativeDayLabel(event.date);

  if (event.category === "earnings" && holdingSymbols.has(event.symbol ?? "")) {
    const key = `event:earnings:${event.id}:${day}`;
    showOnce(key, () => {
      toast.event(`${event.symbol} báo cáo ${when}`, {
        description: event.subtitle ?? event.title,
      });
    });
    return;
  }

  if (event.category === "dividend") {
    const sym = event.symbol;
    if (!sym || !holdingSymbols.has(sym)) return;
    const daysAway = differenceInCalendarDays(parseISO(event.date), new Date());
    if (daysAway < 0 || daysAway > 3) return;

    const key = `event:dividend:${event.id}:${day}`;
    showOnce(key, () => {
      const amount =
        event.amount != null ? ` · $${event.amount.toFixed(2)}/cp` : "";
      toast.event(`${sym} cổ tức ${when}${amount}`, {
        description: event.subtitle ?? event.title,
      });
    });
    return;
  }

  if (event.category === "macro" && event.impact === "high") {
    const daysAway = differenceInCalendarDays(parseISO(event.date), new Date());
    if (daysAway !== 0) return;

    const key = `event:macro:${event.id}:${day}`;
    showOnce(key, () => {
      toast.event(`${event.title} hôm nay`, {
        description: event.subtitle ?? "Sự kiện vĩ mô quan trọng",
      });
    });
  }
}

export async function notifyUpcomingEvents(symbols: string[]) {
  if (symbols.length === 0) return;

  const today = new Date();
  const from = format(today, "yyyy-MM-dd");
  const to = format(addDays(today, 7), "yyyy-MM-dd");
  const macroTo = format(addDays(today, 1), "yyyy-MM-dd");

  const params = new URLSearchParams({
    from,
    to,
    macroFrom: from,
    macroTo,
    symbols: symbols.join(","),
  });

  try {
    const data = await fetchJson<{ events?: CalendarEvent[] }>(
      `/api/events?${params.toString()}`,
      { ttlMs: 5 * 60 * 1000 }
    );
    const holdingSymbols = new Set(symbols);
    for (const event of data.events ?? []) {
      toastForEvent(event, holdingSymbols);
    }
  } catch {
    // silent — events page shows errors
  }
}
