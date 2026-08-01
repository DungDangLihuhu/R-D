export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatShares(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  if (Number.isInteger(rounded)) return formatNumber(rounded, 0);
  return formatNumber(rounded, 4);
}

export function formatPnlArrow(value: number): string {
  const arrow = value >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(value).toFixed(2)}%`;
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}
