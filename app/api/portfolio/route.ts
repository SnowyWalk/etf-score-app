import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/session";
import {
  getPortfolioState,
  updateStrategyPolicy,
} from "@/lib/portfolio/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json(getPortfolioState());
}

export async function PATCH(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();

  return NextResponse.json({
    policy: updateStrategyPolicy(body),
  });
}
