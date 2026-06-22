import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/auth/session";
import { runPolicyBacktest } from "@/lib/backtest/engine";
import { getConfiguredMarketProvider } from "@/lib/market-data/provider";
import { getPortfolioState } from "@/lib/portfolio/repository";
import { US_ETF_UNIVERSE } from "@/lib/portfolio/universe";
import type { BacktestConfig } from "@/types/backtest";
import type { Candle, MarketDataProvider } from "@/types/market";
import type { RebalanceFrequency, StrategyPolicy } from "@/types/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OptimizerResult = {
  policy: StrategyPolicy;
  metrics: {
    endValue: number;
    totalReturn: number;
    cagr: number;
    maxDrawdown: number;
    annualizedVolatility: number;
    sharpeRatio: number;
    calmarRatio: number;
    rebalanceCount: number;
    turnover: number;
    averageTurnover: number;
    excessCagr?: number;
  };
};

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNumbers(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsed = value.map(Number).filter(Number.isFinite);

  return parsed.length > 0 ? parsed : fallback;
}

function asFrequencies(value: unknown): RebalanceFrequency[] {
  if (!Array.isArray(value)) {
    return ["monthly", "quarterly"];
  }

  const parsed = value.filter(
    (item): item is RebalanceFrequency =>
      item === "monthly" || item === "quarterly"
  );

  return parsed.length > 0 ? parsed : ["monthly", "quarterly"];
}

function normalizeConfig(body: Record<string, unknown>): Omit<BacktestConfig, "strategy"> {
  const endDate = String(body.endDate ?? new Date().toISOString().slice(0, 10));
  const defaultStart = new Date(endDate);
  defaultStart.setFullYear(defaultStart.getFullYear() - 5);

  return {
    symbols: Array.isArray(body.symbols) && body.symbols.length > 0
      ? body.symbols.map(String)
      : [...US_ETF_UNIVERSE],
    startDate: String(body.startDate ?? defaultStart.toISOString().slice(0, 10)),
    endDate,
    rebalanceFrequency: "monthly",
    rebalanceMode: body.rebalanceMode === "scheduled" ? "scheduled" : "threshold",
    driftThresholdPct: 5,
    returnBasis: body.returnBasis === "krwInvestor" ? "krwInvestor" : "localPrice",
    initialCapital: toNumber(body.initialCapital, 10_000),
    transactionCostBps: toNumber(body.transactionCostBps, 5),
    slippageBps: toNumber(body.slippageBps, 0),
    benchmarkSymbol: String(body.benchmarkSymbol ?? "SPY"),
  };
}

function cachedProvider(provider: MarketDataProvider): MarketDataProvider {
  const historical = new Map<string, Promise<Candle[]>>();
  const daily = new Map<string, Promise<Candle[]>>();

  return {
    id: provider.id,
    getDailyCandles(input) {
      const key = JSON.stringify(input);

      if (!daily.has(key)) {
        daily.set(key, provider.getDailyCandles(input));
      }

      return daily.get(key)!;
    },
    getHistoricalDailyCandles(input) {
      const key = JSON.stringify(input);

      if (!historical.has(key)) {
        historical.set(key, provider.getHistoricalDailyCandles(input));
      }

      return historical.get(key)!;
    },
  };
}

function sortResults(a: OptimizerResult, b: OptimizerResult) {
  if (b.metrics.calmarRatio !== a.metrics.calmarRatio) {
    return b.metrics.calmarRatio - a.metrics.calmarRatio;
  }

  if (b.metrics.cagr !== a.metrics.cagr) {
    return b.metrics.cagr - a.metrics.cagr;
  }

  return b.metrics.maxDrawdown - a.metrics.maxDrawdown;
}

export async function POST(request: Request) {
  const unauthorized = requireApiAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const basePolicy = getPortfolioState().policy;
    const config = normalizeConfig(body);
    const provider = cachedProvider(getConfiguredMarketProvider());
    const frequencies = asFrequencies(body.rebalanceFrequencies);
    const driftThresholds = asNumbers(body.driftThresholds, [3, 5, 7, 10, 15]);
    const liquidityScores = asNumbers(body.minLiquidityScores, [70, 75, 80]);
    const maxWeights = asNumbers(body.maxSingleEtfWeights, [35, 45, 55]);
    const cashBuffers = asNumbers(body.cashBuffers, [0, 2, 5, 10]);
    const limit = Math.max(1, Math.min(50, toNumber(body.limit, 10)));
    const minCagr = toNumber(body.minCagr, -Infinity);
    const maxMdd = toNumber(body.maxMdd, Infinity);
    const results: OptimizerResult[] = [];
    let evaluated = 0;

    for (const rebalanceFrequency of frequencies) {
      for (const driftThresholdPct of driftThresholds) {
        for (const minLiquidityScore of liquidityScores) {
          for (const maxSingleEtfWeight of maxWeights) {
            for (const cashBufferPct of cashBuffers) {
              const policy: StrategyPolicy = {
                ...basePolicy,
                id: `${basePolicy.id}-candidate`,
                name: `${basePolicy.name} Candidate`,
                rebalanceFrequency,
                driftThresholdPct,
                minLiquidityScore,
                maxSingleEtfWeight,
                cashBufferPct,
              };
              const result = await runPolicyBacktest(
                {
                  ...config,
                  rebalanceFrequency,
                  driftThresholdPct,
                },
                policy,
                provider
              );
              evaluated += 1;
              const metrics = {
                endValue: result.summary.endValue,
                totalReturn: result.summary.totalReturn,
                cagr: result.summary.cagr,
                maxDrawdown: result.summary.maxDrawdown,
                annualizedVolatility: result.summary.annualizedVolatility,
                sharpeRatio: result.summary.sharpeRatio,
                calmarRatio: result.summary.calmarRatio,
                rebalanceCount: result.summary.rebalanceCount,
                turnover: result.summary.turnover,
                averageTurnover: result.summary.averageTurnover,
                excessCagr: result.benchmark?.excessCagr,
              };

              if (metrics.cagr >= minCagr && Math.abs(metrics.maxDrawdown) <= maxMdd) {
                results.push({ policy, metrics });
              }
            }
          }
        }
      }
    }

    results.sort(sortResults);

    return NextResponse.json({
      provider: provider.id,
      config,
      evaluated,
      returned: Math.min(limit, results.length),
      ranking: "calmarRatio desc, cagr desc, maxDrawdown desc",
      results: results.slice(0, limit),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Optimization failed.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
