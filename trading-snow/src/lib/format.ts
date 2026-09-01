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

export function formatVolume(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 2)} Tỷ`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} Tr`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 1)} N`;
  return formatNumber(value, 0);
}

export function formatShares(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  if (Number.isInteger(rounded)) return formatNumber(rounded, 0);
  return formatNumber(rounded, 4);
}

export function formatPnlArrow(value: number): string {
  const arrow = value >= 0 ? "▲" : "▼";
  // no-break space: mũi tên không được rớt xuống dòng riêng khi cột hẹp
  return `${arrow} ${Math.abs(value).toFixed(2)}%`;
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/** Mốc thời gian làm mới giá — ngày một mình vô nghĩa khi refresh mỗi 5 phút. */
export function formatDateTime(date: string): string {
  const d = new Date(date);
  const time = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? time : `${time} ${formatDate(date)}`;
}

/** Trục chart: MM/YYYY */
export function formatChartMonthYear(date: string): string {
  const d = new Date(date);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${yyyy}`;
}

/** Tháng P&L dạng YYYY-MM → MM/YYYY */
export function formatMonthKey(month: string): string {
  const [year, mon] = month.split("-");
  if (!year || !mon) return month;
  return `${mon}/${year}`;
}

/** Downsample chuỗi thời gian: 1 điểm / tháng, luôn giữ điểm đầu và cuối. */
export function downsampleMonthly<T extends { date: string }>(points: T[]): T[] {
  if (points.length <= 2) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const byMonth = new Map<string, T>();

  for (const p of points) {
    const key = p.date.slice(0, 7);
    const prev = byMonth.get(key);
    if (!prev || p.date >= prev.date) {
      byMonth.set(key, p);
    }
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of [first, ...byMonth.values(), last]) {
    if (seen.has(p.date)) continue;
    seen.add(p.date);
    out.push(p);
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Finnhub market cap is in millions USD */
export function formatMarketCap(millions: number, currency = "USD"): string {
  const usd = millions * 1_000_000;
  const abs = Math.abs(usd);
  if (abs >= 1e12) return `${(usd / 1e12).toFixed(2)}T ${currency}`;
  if (abs >= 1e9) return `${(usd / 1e9).toFixed(2)}B ${currency}`;
  if (abs >= 1e6) return `${(usd / 1e6).toFixed(2)}M ${currency}`;
  return formatMoney(usd, currency);
}

export function formatRatio(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
