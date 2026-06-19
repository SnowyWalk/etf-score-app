import { NextResponse } from "next/server";

import { recordManualTrade } from "@/lib/portfolio/repository";
import type { TradeSide } from "@/types/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: Request) {
  const body = await request.json();
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const side = String(body.side ?? "buy") as TradeSide;
  const quantity = asNumber(body.quantity);
  const price = asNumber(body.price);

  if (!symbol || !["buy", "sell"].includes(side) || quantity <= 0 || price <= 0) {
    return NextResponse.json(
      { message: "symbol, side, quantity and price are required." },
      { status: 400 }
    );
  }

  const trade = recordManualTrade({
    symbol,
    side,
    quantity,
    price,
    currency: String(body.currency ?? "USD").toUpperCase(),
    tradeDate: String(body.tradeDate ?? new Date().toISOString().slice(0, 10)),
    fee: asNumber(body.fee),
    fxRate: asNumber(body.fxRate, 1),
  });

  return NextResponse.json({ trade }, { status: 201 });
}
