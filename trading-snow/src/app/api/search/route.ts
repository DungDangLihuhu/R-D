import { NextRequest, NextResponse } from "next/server";
import { searchYahooSymbols } from "@/lib/yahoo";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > 40) {
    return NextResponse.json({ error: "query too long" }, { status: 400 });
  }

  try {
    const results = await searchYahooSymbols(q, 8);
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "search failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
