import { NextRequest, NextResponse } from "next/server";
import {
  checkWriteKey,
  getCloudConfigStatus,
  getRedis,
  normalizeRoomId,
  redisKey,
  validateAppState,
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

  const payload = await redis.get<StoredPayload>(redisKey(room));
  if (!payload) {
    return NextResponse.json({ configured: true, state: null, updatedAt: null });
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
  await redis.set(redisKey(room), payload);

  return NextResponse.json({ ok: true, updatedAt });
}
