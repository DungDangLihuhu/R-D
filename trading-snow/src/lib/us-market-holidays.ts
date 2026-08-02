export interface UsHoliday {
  date: string;
  name: string;
  tradingHour?: string;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** NYSE observed date when holiday falls on weekend. */
function observeFixed(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const dow = dt.getUTCDay();
  if (dow === 0) dt.setUTCDate(dt.getUTCDate() + 1);
  if (dow === 6) dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number
): string {
  const dt = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (dt.getUTCMonth() === month - 1) {
    if (dt.getUTCDay() === weekday) {
      count++;
      if (count === n) return dt.toISOString().slice(0, 10);
    }
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return toDateStr(year, month, 1);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const dt = new Date(Date.UTC(year, month, 0));
  while (dt.getUTCMonth() === month - 1) {
    if (dt.getUTCDay() === weekday) return dt.toISOString().slice(0, 10);
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  return toDateStr(year, month, 1);
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(iso: string, days: number): string {
  const dt = new Date(`${iso}T12:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isWeekday(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00.000Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

export function holidaysForYear(year: number): UsHoliday[] {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter.toISOString().slice(0, 10), -2);
  const thanksgiving = nthWeekday(year, 11, 4, 4);

  const items: UsHoliday[] = [
    { date: observeFixed(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { date: nthWeekday(year, 2, 1, 3), name: "Washington's Birthday" },
    { date: goodFriday, name: "Good Friday" },
    { date: lastWeekday(year, 5, 1), name: "Memorial Day" },
    { date: observeFixed(year, 6, 19), name: "Juneteenth National Independence Day" },
    { date: observeFixed(year, 7, 4), name: "Independence Day" },
    { date: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { date: thanksgiving, name: "Thanksgiving Day" },
    { date: observeFixed(year, 12, 25), name: "Christmas Day" },
  ];

  const july4 = observeFixed(year, 7, 4);
  const dayBeforeJuly4 = addDays(july4, -1);
  if (isWeekday(dayBeforeJuly4) && dayBeforeJuly4 !== july4) {
    items.push({
      date: dayBeforeJuly4,
      name: "Independence Day (early close)",
      tradingHour: "13:00 ET",
    });
  }

  const blackFriday = addDays(thanksgiving, 1);
  if (isWeekday(blackFriday)) {
    items.push({
      date: blackFriday,
      name: "Day after Thanksgiving (early close)",
      tradingHour: "13:00 ET",
    });
  }

  const christmas = observeFixed(year, 12, 25);
  const christmasEve = addDays(christmas, -1);
  if (isWeekday(christmasEve) && christmasEve !== christmas) {
    items.push({
      date: christmasEve,
      name: "Christmas Eve (early close)",
      tradingHour: "13:00 ET",
    });
  }

  return items;
}

export function getUsMarketHolidays(from: string, to: string): UsHoliday[] {
  const fromD = from.slice(0, 10);
  const toD = to.slice(0, 10);
  const fromYear = Number(fromD.slice(0, 4));
  const toYear = Number(toD.slice(0, 4));
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) return [];

  const all: UsHoliday[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    all.push(...holidaysForYear(year));
  }

  return all.filter((h) => h.date >= fromD && h.date <= toD);
}
