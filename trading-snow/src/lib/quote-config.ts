export function inspectFinnhubKey(key?: string | null) {
  const trimmed = key?.trim() ?? "";
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

  return {
    configured: true,
    valid: true,
    hint: "FINNHUB_API_KEY đã cấu hình.",
    preview: `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`,
  };
}

export function inspectTwelveDataKey(key?: string | null) {
  const trimmed = key?.trim() ?? "";
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
