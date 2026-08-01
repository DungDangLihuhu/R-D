import { Redis } from "@upstash/redis";
import type { AppState } from "./types";

const KEY_PREFIX = "trading-snow";

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getRedis(): Redis | null {
  if (!isCloudConfigured()) return null;
  return Redis.fromEnv();
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
