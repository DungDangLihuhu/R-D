type CacheEntry<T> = { value: T; expires: number };

const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function remember<T>(key: string, ttlMs: number, value: T) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > MAX_ENTRIES) {
    for (const [k, entry] of store) {
      if (entry.expires <= Date.now()) store.delete(k);
    }
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;

  // Nhiều request cùng key chỉ được gọi provider một lần — tránh rate-limit Yahoo/Finnhub.
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fn()
    .then((value) => {
      remember(key, ttlMs, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function cacheKey(parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(":");
}
