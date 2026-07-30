import { NextRequest, NextResponse } from "next/server";
import { fetchDividends } from "@/lib/yahoo";

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "symbols required" }, { status: 400 });
  }

  const list = symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== "CASH")
    .slice(0, 20);

  try {
    const results = await Promise.all(list.map((s) => fetchDividends(s)));
    const events = results.flat().sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json({ events, updatedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
