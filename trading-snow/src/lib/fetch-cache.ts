type CacheEntry<T> = { value: T; expires: number };

const MAX_ENTRIES = 200;

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function remember<T>(url: string, ttlMs: number, value: T) {
  cache.set(url, { value, expires: Date.now() + ttlMs });
  if (cache.size > MAX_ENTRIES) {
    for (const [k, entry] of cache) {
      if (entry.expires <= Date.now()) cache.delete(k);
    }
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
}

export async function fetchJson<T>(
  url: string,
  opts?: { ttlMs?: number; init?: RequestInit }
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? 0;

  if (ttlMs > 0) {
    const hit = cache.get(url) as CacheEntry<T> | undefined;
    if (hit && hit.expires > Date.now()) return hit.value;
  }

  const pending = inflight.get(url) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetch(url, opts?.init)
    .then(async (res) => {
      const json = (await res.json()) as T;
      if (!res.ok) {
        throw new Error(
          typeof json === "object" && json && "error" in json
            ? String((json as { error?: string }).error)
            : `HTTP ${res.status}`
        );
      }
      if (ttlMs > 0) remember(url, ttlMs, json);
      return json;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}
