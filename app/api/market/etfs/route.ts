import { NextResponse } from "next/server";

import { getEtfMarketSnapshot } from "@/lib/market-data/snapshot";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const snapshot = await getEtfMarketSnapshot({
    symbols: searchParams.get("symbols") ?? undefined,
    forceRefresh: searchParams.get("refresh") === "true",
    returnBasis: searchParams.get("returnBasis") ?? undefined,
  });

  return NextResponse.json(snapshot);
}
