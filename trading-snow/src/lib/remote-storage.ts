import type { AppState } from "./types";
import { DEFAULT_SYNC_ROOM } from "./cloud";
import type { SyncBase } from "./sync-merge";

const ROOM_KEY = "trading-snow-room-id";
const WRITE_KEY_STORAGE = "trading-snow-write-key";
const SYNC_BASE_KEY = "trading-snow-sync-base";

/** Bản đồng bộ gần nhất — giữ qua lần tải lại để thay đổi chưa kịp đẩy lên không bị bản cloud ghi đè. */
export function loadSyncBase(): SyncBase | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNC_BASE_KEY);
    return raw ? (JSON.parse(raw) as SyncBase) : null;
  } catch {
    return null;
  }
}

export function saveSyncBase(base: SyncBase): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(base));
  } catch {
    // Hết quota: lần sau coi như chưa có base — cloud thắng, như cách đồng bộ cũ.
  }
}

export function getSyncRoomId(): string {
  if (typeof window === "undefined") return DEFAULT_SYNC_ROOM;
  return localStorage.getItem(ROOM_KEY) || DEFAULT_SYNC_ROOM;
}

export function setSyncRoomId(room: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ROOM_KEY, room.trim().toLowerCase());
}

export function getClientWriteKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WRITE_KEY_STORAGE);
}

export function setClientWriteKey(key: string): void {
  if (typeof window === "undefined") return;
  if (!key.trim()) {
    localStorage.removeItem(WRITE_KEY_STORAGE);
    return;
  }
  localStorage.setItem(WRITE_KEY_STORAGE, key.trim());
}

/** Cấu hình server không đổi trong một phiên — chỉ hỏi một lần cho mọi caller. */
let configuredCheck: Promise<boolean> | null = null;

export function checkCloudConfigured(): Promise<boolean> {
  configuredCheck ??= fetch("/api/data?check=1")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => Boolean(data?.configured))
    .catch(() => false);
  return configuredCheck;
}

export async function loadRemoteState(
  room: string
): Promise<{ state: AppState; updatedAt: string } | null> {
  const res = await fetch(`/api/data?room=${encodeURIComponent(room)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.state) return null;
  return { state: data.state as AppState, updatedAt: data.updatedAt as string };
}

export type SaveRemoteResult =
  | { status: "saved"; updatedAt: string }
  /** Máy khác đã lưu sau phiên bản `baseUpdatedAt` — gộp với bản này rồi lưu lại. */
  | { status: "conflict"; state: AppState; updatedAt: string }
  | { status: "failed" };

/**
 * `baseUpdatedAt`: phiên bản cloud mà `state` được dựng từ đó ("" = cloud chưa có gì).
 * Bỏ trống thì server ghi đè không kiểm tra.
 */
export async function saveRemoteState(
  room: string,
  state: AppState,
  baseUpdatedAt?: string | null
): Promise<SaveRemoteResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const writeKey = getClientWriteKey();
  if (writeKey) headers["x-sync-key"] = writeKey;
  if (baseUpdatedAt != null) headers["x-base-updated-at"] = baseUpdatedAt;

  try {
    const res = await fetch(`/api/data?room=${encodeURIComponent(room)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(state),
    });
    const data = await res.json().catch(() => null);

    if (res.status === 409 && data?.state) {
      return {
        status: "conflict",
        state: data.state as AppState,
        updatedAt: data.updatedAt as string,
      };
    }
    if (!res.ok || !data?.updatedAt) return { status: "failed" };
    return { status: "saved", updatedAt: data.updatedAt as string };
  } catch {
    return { status: "failed" };
  }
}
