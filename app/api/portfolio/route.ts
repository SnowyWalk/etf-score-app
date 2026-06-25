import { NextResponse } from "next/server";

import {
  getPortfolioState,
  updateStrategyPolicy,
} from "@/lib/portfolio/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPortfolioState());
}

export async function PATCH(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    policy: updateStrategyPolicy(body),
  });
}
