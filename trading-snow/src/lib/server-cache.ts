type CacheEntry<T> = { value: T; expires: number };

const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function cacheKey(parts: (string | number | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(":");
}
