import { NextResponse } from "next/server";

import { defaultEtfUniverse } from "@/data/etf-metadata";
import { runBacktest } from "@/lib/backtest/engine";
import { getConfiguredMarketProvider } from "@/lib/market-data/provider";
import type { BacktestConfig } from "@/types/backtest";
import type { StrategyType } from "@/types/etf";

const strategies: StrategyType[] = ["aggressive", "balanced", "defensive"];

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(body: Partial<BacktestConfig>): BacktestConfig {
  const endDate = body.endDate ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(endDate);
  defaultStart.setFullYear(defaultStart.getFullYear() - 5);
  const strategy = strategies.includes(body.strategy as StrategyType)
    ? (body.strategy as StrategyType)
    : "balanced";

  return {
    symbols: body.symbols?.length ? body.symbols : defaultEtfUniverse,
    strategy,
    startDate: body.startDate ?? defaultStart.toISOString().slice(0, 10),
    endDate,
    rebalanceFrequency:
      body.rebalanceFrequency === "quarterly" ? "quarterly" : "monthly",
    rebalanceMode:
      body.rebalanceMode === "threshold" ? "threshold" : "scheduled",
    driftThresholdPct: toNumber(body.driftThresholdPct, 5),
    returnBasis: body.returnBasis === "localPrice" ? "localPrice" : "krwInvestor",
    initialCapital: toNumber(body.initialCapital, 10_000),
    transactionCostBps: toNumber(body.transactionCostBps, 5),
    slippageBps: toNumber(body.slippageBps, 0),
    benchmarkSymbol: body.benchmarkSymbol ?? "SPY",
  };
}

export async function POST(request: Request) {
  try {
    const config = normalizeConfig(await request.json());
    const provider = getConfiguredMarketProvider();
    const result = await runBacktest(config, provider);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backtest failed.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
