type CacheEntry<T> = { value: T; expires: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function fetchJson<T>(
  url: string,
  opts?: { ttlMs?: number; init?: RequestInit }
): Promise<T> {
  const ttlMs = opts?.ttlMs ?? 0;
  const now = Date.now();

  if (ttlMs > 0) {
    const hit = cache.get(url) as CacheEntry<T> | undefined;
    if (hit && hit.expires > now) return hit.value;
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
      if (ttlMs > 0) {
        cache.set(url, { value: json, expires: now + ttlMs });
      }
      return json;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, promise);
  return promise;
}
