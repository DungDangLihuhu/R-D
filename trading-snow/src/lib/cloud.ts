import { Redis } from "@upstash/redis";
import type { AppState } from "./types";

const KEY_PREFIX = "trading-snow";

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

/** Resolve Redis REST credentials from Upstash or Vercel KV env names */
export function getRedisCredentials(): { url: string; token: string } | null {
  const url = trimEnv(
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  );
  const token = trimEnv(
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  );
  if (!url || !token) return null;
  return { url, token };
}

export function isCloudConfigured(): boolean {
  return getRedisCredentials() !== null;
}

export function getCloudConfigStatus() {
  const hasUpstashUrl = Boolean(trimEnv(process.env.UPSTASH_REDIS_REST_URL));
  const hasUpstashToken = Boolean(trimEnv(process.env.UPSTASH_REDIS_REST_TOKEN));
  const hasKvUrl = Boolean(trimEnv(process.env.KV_REST_API_URL));
  const hasKvToken = Boolean(trimEnv(process.env.KV_REST_API_TOKEN));
  const creds = getRedisCredentials();

  return {
    configured: creds !== null,
    hasUpstashUrl,
    hasUpstashToken,
    hasKvUrl,
    hasKvToken,
    using: creds
      ? hasUpstashUrl
        ? "upstash"
        : "kv"
      : null,
  };
}

export function getRedis(): Redis | null {
  const creds = getRedisCredentials();
  if (!creds) return null;
  return new Redis({ url: creds.url, token: creds.token });
}

export function normalizeRoomId(room: string): string | null {
  const id = room.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(id)) return null;
  return id;
}

export function redisKey(room: string): string {
  return `${KEY_PREFIX}:${room}`;
}

/**
 * Phiên bản (updatedAt) cất riêng một key nhỏ: poll mỗi 20 giây chỉ cần đọc key này,
 * không phải tải cả state (toàn bộ lệnh) chỉ để biết có gì đổi hay không.
 */
export function versionKey(room: string): string {
  return `${redisKey(room)}:ver`;
}

/** Ghi đè không kiểm tra phiên bản (client cũ không gửi phiên bản đang dựa vào). */
export async function setPayload(redis: Redis, room: string, payload: StoredPayload) {
  await redis.set(redisKey(room), payload);
  await redis.set(versionKey(room), payload.updatedAt);
}

export interface StoredPayload {
  state: AppState;
  updatedAt: string;
}

/**
 * Kiểm tra phiên bản và ghi trong cùng một script — không có khe giữa GET và SET để
 * hai máy lưu gần như cùng lúc lọt qua cả hai. Trả về bản đang lưu khi phiên bản lệch.
 */
const COMPARE_AND_SET = `
local current = redis.call("GET", KEYS[1])
if current then
  local ok, decoded = pcall(cjson.decode, current)
  if not ok or decoded["updatedAt"] ~= ARGV[1] then
    return current
  end
end
redis.call("SET", KEYS[1], ARGV[2])
redis.call("SET", KEYS[2], ARGV[3])
return false
`;

/**
 * Ghi `payload` chỉ khi bản trên cloud vẫn là `expectedUpdatedAt` ("" = chưa có gì).
 * Lệch phiên bản thì không ghi và trả về bản hiện có để client gộp rồi lưu lại.
 */
export async function compareAndSetPayload(
  redis: Redis,
  room: string,
  expectedUpdatedAt: string,
  payload: StoredPayload
): Promise<StoredPayload | null> {
  let current: unknown;
  try {
    current = await redis.eval(COMPARE_AND_SET, [redisKey(room), versionKey(room)], [
      expectedUpdatedAt,
      JSON.stringify(payload),
      payload.updatedAt,
    ]);
  } catch {
    // Redis không cho chạy Lua: kiểm tra rồi ghi, chấp nhận khe rất nhỏ giữa hai lệnh.
    const existing = await redis.get<StoredPayload>(redisKey(room));
    if (existing && existing.updatedAt !== expectedUpdatedAt) return existing;
    await setPayload(redis, room, payload);
    return null;
  }
  if (current == null || current === false) return null;
  return (typeof current === "string" ? JSON.parse(current) : current) as StoredPayload;
}

export function validateAppState(data: unknown): data is AppState {
  if (!data || typeof data !== "object") return false;
  const s = data as AppState;
  return Array.isArray(s.portfolios) && Array.isArray(s.transactions);
}

export function checkWriteKey(reqKey: string | null): boolean {
  const secret = process.env.SYNC_WRITE_KEY;
  if (!secret) return true;
  return reqKey === secret;
}

export const DEFAULT_SYNC_ROOM =
  process.env.NEXT_PUBLIC_SYNC_ROOM?.trim().toLowerCase() || "shared";
