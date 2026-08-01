import type { AppState } from "./types";
import { DEFAULT_SYNC_ROOM } from "./cloud";

const ROOM_KEY = "trading-snow-room-id";
const WRITE_KEY_STORAGE = "trading-snow-write-key";

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

export async function checkCloudConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/data?check=1");
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.configured);
  } catch {
    return false;
  }
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

export async function saveRemoteState(
  room: string,
  state: AppState
): Promise<string | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const writeKey = getClientWriteKey();
  if (writeKey) headers["x-sync-key"] = writeKey;

  const res = await fetch(`/api/data?room=${encodeURIComponent(room)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(state),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data.updatedAt as string) ?? null;
}
