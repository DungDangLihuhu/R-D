import { NextResponse } from "next/server";

export function jsonCached(
  data: unknown,
  maxAgeSec = 300,
  staleSec = 600
): NextResponse {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, s-maxage=${maxAgeSec}, stale-while-revalidate=${staleSec}`,
    },
  });
}
