const SESSION_KEY = "trading-snow-logos";
const BATCH_WINDOW_MS = 16;

type Resolver = (logo: string | null) => void;

const logoCache = new Map<string, string | null>();
const waiting = new Map<string, Resolver[]>();
const inflight = new Map<string, Promise<string | null>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionLoaded = false;

function restoreSession() {
  if (sessionLoaded || typeof sessionStorage === "undefined") return;
  sessionLoaded = true;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    for (const [sym, logo] of Object.entries(
      JSON.parse(raw) as Record<string, string | null>
    )) {
      logoCache.set(sym, logo);
    }
  } catch {
    // sessionStorage bị chặn hoặc dữ liệu hỏng — bỏ qua, chỉ mất cache
  }
}

function persistSession() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(Object.fromEntries(logoCache))
    );
  } catch {
    // quota — bỏ qua
  }
}

function settle(pending: Map<string, Resolver[]>, logos: Map<string, string | null>) {
  for (const [symbol, resolvers] of pending) {
    const logo = logos.get(symbol) ?? null;
    logoCache.set(symbol, logo);
    inflight.delete(symbol);
    for (const resolve of resolvers) resolve(logo);
  }
}

async function flush() {
  flushTimer = null;
  if (waiting.size === 0) return;

  const pending = new Map(waiting);
  waiting.clear();

  const symbols = [...pending.keys()];
  try {
    const res = await fetch(
      `/api/profile?symbols=${encodeURIComponent(symbols.join(","))}`
    );
    const data = (await res.json()) as {
      profiles?: { symbol: string; logo?: string }[];
    };
    settle(
      pending,
      new Map((data.profiles ?? []).map((p) => [p.symbol, p.logo ?? null]))
    );
    persistSession();
  } catch {
    settle(pending, new Map());
  }
}

/**
 * Gom mọi mã cần logo trong cùng một khung render thành một request duy nhất —
 * trước đây mỗi <SymbolAvatar> tự gọi API riêng (8 mã = 8 request).
 */
export function fetchProfileLogo(symbol: string): Promise<string | null> {
  const key = symbol.trim().toUpperCase();
  if (!key || key === "CASH") return Promise.resolve(null);

  restoreSession();
  if (logoCache.has(key)) return Promise.resolve(logoCache.get(key) ?? null);

  // Avatar mount sau khi batch đầu đã bay: bám vào promise đang chờ thay vì
  // mở thêm một request nữa cho cùng mã.
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = new Promise<string | null>((resolve) => {
    const queued = waiting.get(key);
    if (queued) {
      queued.push(resolve);
      return;
    }
    waiting.set(key, [resolve]);
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  });

  inflight.set(key, promise);
  return promise;
}
