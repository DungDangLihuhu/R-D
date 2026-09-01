"use client";

import { useEffect, useState } from "react";
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
  const [room, setRoom] = useState(() =>
    typeof window !== "undefined" ? getSyncRoomId() : ""
  );
  const [draft, setDraft] = useState(() =>
    typeof window !== "undefined" ? getSyncRoomId() : ""
  );
  const [msg, setMsg] = useState("");

  useEffect(() => {
    checkCloudConfigured().then(setConfigured);
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

  // Chưa bật cloud thì đây là việc của người deploy, không phải của người xem
  // danh mục — thu về một dòng, chi tiết nằm sau nút mở.
  if (!configured) {
    return (
      <details className="text-xs text-gray-500">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-app-muted marker:content-['']">
          <CloudOff className="h-3.5 w-3.5" />
          Đang lưu cục bộ trên máy này · cách bật đồng bộ nhiều thiết bị
        </summary>
        <div className="mt-2 space-y-1 pl-5">
          <p>
            Cloud chưa bật trên server. Kiểm tra Vercel env{" "}
            <code className="text-rose-600">UPSTASH_REDIS_REST_URL</code> +{" "}
            <code className="text-rose-600">UPSTASH_REDIS_REST_TOKEN</code> →{" "}
            <strong>Redeploy</strong>.
          </p>
          <p>
            Test:{" "}
            <a
              href="/api/data?check=1"
              className="text-sky-600 underline"
              target="_blank"
              rel="noreferrer"
            >
              /api/data?check=1
            </a>{" "}
            — cần <code>configured: true</code>
          </p>
        </div>
      </details>
    );
  }

  return (
    <div className="app-card shadow-sm">
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-sky-600" />
        <h3 className="text-sm font-semibold">Đồng bộ đám mây</h3>
      </div>

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
            className="app-input py-1.5"
          />
          <button
            type="button"
            onClick={applyRoom}
            className="app-btn-primary py-1.5"
          >
            Đổi phòng
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="app-btn-secondary py-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tải lại
          </button>
        </div>
        {msg && <p className="text-xs text-sky-600">{msg}</p>}
      </div>
    </div>
  );
}

/** Compact badge for header */
export function SyncBadge({ configured }: { configured: boolean }) {
  const room = getSyncRoomId();
  if (!configured) {
    return (
      <span className="hidden items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-app-muted sm:inline-flex" style={{ borderColor: "var(--app-border)", background: "var(--app-input-bg)" }}>
        <CloudOff className="h-3 w-3" />
        Local
      </span>
    );
  }
  return (
    <span
      className="app-badge-cloud"
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
