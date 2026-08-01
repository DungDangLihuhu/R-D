"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import {
  checkCloudConfigured,
  getSyncRoomId,
  loadRemoteState,
  saveRemoteState,
  setSyncRoomId,
} from "@/lib/remote-storage";

export function SyncPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [room, setRoom] = useState("");
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    checkCloudConfigured().then(setConfigured);
    const r = getSyncRoomId();
    setRoom(r);
    setDraft(r);
  }, []);

  const applyRoom = async () => {
    const next = draft.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(next)) {
      setMsg("Mã phòng: 3–64 ký tự, chữ/số/_/-");
      return;
    }
    setSyncRoomId(next);
    setRoom(next);
    setMsg("Đã đổi phòng — tải lại trang để đồng bộ");
    window.location.reload();
  };

  if (configured === null) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {configured ? (
          <Cloud className="h-4 w-4 text-sky-600" />
        ) : (
          <CloudOff className="h-4 w-4 text-gray-400" />
        )}
        <h3 className="text-sm font-semibold">Đồng bộ đám mây</h3>
      </div>

      {configured ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">
            Cùng <strong>mã phòng</strong> → cùng dữ liệu trên mọi thiết bị. Phòng hiện tại:{" "}
            <code className="text-sky-700">{room}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="mã-phòng-chung"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={applyRoom}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm text-white hover:bg-sky-400"
            >
              Đổi phòng
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tải lại
            </button>
          </div>
          {msg && <p className="text-xs text-sky-600">{msg}</p>}
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <p>
            Cloud chưa bật trên server. Kiểm tra Vercel env{" "}
            <code className="text-rose-600">UPSTASH_REDIS_REST_URL</code> +{" "}
            <code className="text-rose-600">UPSTASH_REDIS_REST_TOKEN</code> →{" "}
            <strong>Redeploy</strong>.
          </p>
          <p>
            Test:{" "}
            <a href="/api/data?check=1" className="text-sky-600 underline" target="_blank">
              /api/data?check=1
            </a>{" "}
            — cần <code>configured: true</code>
          </p>
        </div>
      )}
    </div>
  );
}

/** Compact badge for header */
export function SyncBadge({ configured }: { configured: boolean }) {
  const room = getSyncRoomId();
  if (!configured) {
    return (
      <span className="hidden items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 sm:inline-flex">
        <CloudOff className="h-3 w-3" />
        Local
      </span>
    );
  }
  return (
    <span
      className="hidden items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 sm:inline-flex"
      title={`Đồng bộ cloud · phòng ${room}`}
    >
      <Cloud className="h-3 w-3" />
      {room}
    </span>
  );
}

export async function pullRemoteToState(
  room: string,
  onState: (state: Awaited<ReturnType<typeof loadRemoteState>>) => void
) {
  const remote = await loadRemoteState(room);
  onState(remote);
}

export { saveRemoteState, loadRemoteState };
