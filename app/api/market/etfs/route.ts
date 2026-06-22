import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/session";
import { getEtfMarketSnapshot } from "@/lib/market-data/snapshot";

export async function GET(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const snapshot = await getEtfMarketSnapshot({
    symbols: searchParams.get("symbols") ?? undefined,
    forceRefresh: searchParams.get("refresh") === "true",
    returnBasis: searchParams.get("returnBasis") ?? undefined,
  });

  return NextResponse.json(snapshot);
}
