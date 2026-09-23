import { NextRequest, NextResponse } from "next/server";
import {
  checkWriteKey,
  compareAndSetPayload,
  getCloudConfigStatus,
  getRedis,
  normalizeRoomId,
  redisKey,
  setPayload,
  validateAppState,
  versionKey,
  type StoredPayload,
} from "@/lib/cloud";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("check") === "1") {
    return NextResponse.json(getCloudConfigStatus());
  }

  const room = normalizeRoomId(req.nextUrl.searchParams.get("room") ?? "");
  if (!room) {
    return NextResponse.json({ error: "room invalid" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ configured: false, error: "cloud not configured" }, { status: 503 });
  }

  // Poll gửi phiên bản đang có: chưa đổi thì chỉ trả phiên bản, không tải cả state.
  const since = req.nextUrl.searchParams.get("since");
  if (since) {
    const version = await redis.get<string>(versionKey(room));
    if (version === since) {
      return NextResponse.json({ configured: true, unchanged: true, updatedAt: version });
    }
  }

  const payload = await redis.get<StoredPayload>(redisKey(room));
  if (!payload) {
    return NextResponse.json({ configured: true, state: null, updatedAt: null });
  }
  if (since && payload.updatedAt === since) {
    // Dữ liệu ghi từ bản server cũ chưa có key phiên bản.
    return NextResponse.json({ configured: true, unchanged: true, updatedAt: since });
  }

  return NextResponse.json({
    configured: true,
    state: payload.state,
    updatedAt: payload.updatedAt,
  });
}

export async function PUT(req: NextRequest) {
  const room = normalizeRoomId(req.nextUrl.searchParams.get("room") ?? "");
  if (!room) {
    return NextResponse.json({ error: "room invalid" }, { status: 400 });
  }

  if (!checkWriteKey(req.headers.get("x-sync-key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ configured: false, error: "cloud not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!validateAppState(body)) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const payload: StoredPayload = { state: body, updatedAt };

  // Client gửi phiên bản nó dựa vào; bản trên cloud đã khác (máy khác vừa lưu) thì trả
  // 409 kèm bản đó để client gộp. Client cũ không gửi header thì vẫn ghi đè như trước.
  const baseUpdatedAt = req.headers.get("x-base-updated-at");
  if (baseUpdatedAt === null) {
    await setPayload(redis, room, payload);
  } else {
    const current = await compareAndSetPayload(redis, room, baseUpdatedAt, payload);
    if (current) {
      return NextResponse.json(
        { conflict: true, state: current.state, updatedAt: current.updatedAt },
        { status: 409 }
      );
    }
  }

  return NextResponse.json({ ok: true, updatedAt });
}
