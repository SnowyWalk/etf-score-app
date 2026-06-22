import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/session";
import { getTossAccountSnapshot, isTossConfigured } from "@/lib/toss/client";

export async function GET(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  if (!isTossConfigured()) {
    return NextResponse.json(
      {
        provider: "tossinvest",
        asOf: new Date().toISOString(),
        accounts: [],
        warnings: [
          "Toss Open API credentials are not configured. Set TOSS_INVEST_CLIENT_ID and TOSS_INVEST_CLIENT_SECRET.",
        ],
      },
      { status: 200 }
    );
  }

  try {
    return NextResponse.json(await getTossAccountSnapshot());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Toss Open API error.";

    return NextResponse.json(
      {
        provider: "tossinvest",
        asOf: new Date().toISOString(),
        accounts: [],
        warnings: [message],
      },
      { status: 502 }
    );
  }
}
