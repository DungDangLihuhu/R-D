const logoCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function getCachedLogo(symbol: string): string | null | undefined {
  const key = symbol.trim().toUpperCase();
  if (!logoCache.has(key)) return undefined;
  return logoCache.get(key) ?? null;
}

export async function fetchProfileLogo(symbol: string): Promise<string | null> {
  const key = symbol.trim().toUpperCase();
  if (!key || key === "CASH") return null;

  if (logoCache.has(key)) return logoCache.get(key) ?? null;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetch(`/api/profile?symbol=${encodeURIComponent(key)}`)
    .then((res) => res.json())
    .then((data: { logo?: string }) => {
      const logo = data.logo ?? null;
      logoCache.set(key, logo);
      return logo;
    })
    .catch(() => {
      logoCache.set(key, null);
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
