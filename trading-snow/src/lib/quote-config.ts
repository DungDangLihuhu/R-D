export function getFinnhubApiKey(): string | undefined {
  return process.env.FINNHUB_API_KEY?.trim() || undefined;
}

export function getTwelveDataApiKey(): string | undefined {
  return process.env.TWELVE_DATA_API_KEY?.trim() || undefined;
}

export async function testFinnhubKey(
  key: string,
): Promise<{ ok: boolean; price?: number; error?: string }> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    const data = (await res.json()) as { c?: number; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    if (data.error) return { ok: false, error: data.error };
    if (typeof data.c !== "number" || data.c <= 0) {
      return { ok: false, error: "No price in response" };
    }
    return { ok: true, price: data.c };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function inspectFinnhubKey(key?: string | null) {
  const trimmed = key?.trim() ?? getFinnhubApiKey() ?? "";
  if (!trimmed) {
    return {
      configured: false,
      valid: false,
      hint: "Chưa có FINNHUB_API_KEY trên server (Vercel → Environment Variables).",
    };
  }

  if (trimmed.startsWith("sk_live_") || trimmed.startsWith("sk_test_")) {
    return {
      configured: true,
      valid: false,
      hint:
        "Key bắt đầu sk_live_/sk_test_ là Stripe, KHÔNG phải Finnhub. Vào finnhub.io → Dashboard → API Key.",
    };
  }

  if (trimmed.length > 24) {
    const half = Math.floor(trimmed.length / 2);
    const duplicated = trimmed.slice(0, half) === trimmed.slice(half);
    return {
      configured: true,
      valid: false,
      length: trimmed.length,
      hint: duplicated
        ? `Key dán trùng 2 lần (${trimmed.length} ký tự). Chỉ giữ 1 key ~20 ký tự từ finnhub.io/dashboard.`
        : `Key dài ${trimmed.length} ký tự — Finnhub thường ~20 ký tự. Kiểm tra không dán thừa khi copy.`,
    };
  }

  return {
    configured: true,
    valid: true,
    hint: "FINNHUB_API_KEY đã cấu hình.",
    preview: `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`,
    length: trimmed.length,
  };
}

export function inspectTwelveDataKey(key?: string | null) {
  const trimmed = key?.trim() ?? getTwelveDataApiKey() ?? "";
  if (!trimmed) {
    return { configured: false, valid: false, hint: "Chưa có TWELVE_DATA_API_KEY." };
  }
  return {
    configured: true,
    valid: true,
    hint: "TWELVE_DATA_API_KEY đã cấu hình.",
    preview: `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`,
  };
}
