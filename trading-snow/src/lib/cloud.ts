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

export interface StoredPayload {
  state: AppState;
  updatedAt: string;
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
