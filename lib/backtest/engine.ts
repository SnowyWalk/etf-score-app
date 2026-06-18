import type {
  BacktestConfig,
  BacktestPoint,
  BacktestResult,
  RebalanceEvent,
} from "../../types/backtest";
import type { Candle, MarketDataProvider } from "../../types/market";
import {
  USD_KRW_SYMBOL,
  buildEtfRowsFromCandles,
  normalizeCandlesForReturnBasis,
} from "../market-data/metrics";
import { buildPortfolioRecommendation } from "../recommendation";
import { calculateEtfScores } from "../scoring";
import { getStrategyPreset } from "../strategy-presets";

const TRADING_DAYS_PER_YEAR = 252;
const TRAILING_CANDLE_COUNT = 320;

type CandleMap = Record<string, Candle[]>;
type WeightMap = Record<string, number>;

function dateKey(date: string) {
  return date.slice(0, 10);
}

function tradingDays(candlesBySymbol: CandleMap, startDate: string, endDate: string) {
  const base = candlesBySymbol.SPY ?? Object.values(candlesBySymbol)[0] ?? [];
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  return base
    .filter((candle) => {
      const time = new Date(candle.date).getTime();
      return time >= start && time <= end;
    })
    .map((candle) => candle.date);
}

function rebalanceDates(
  dates: string[],
  frequency: BacktestConfig["rebalanceFrequency"]
) {
  const selected: string[] = [];
  let previousBucket = "";

  for (const date of dates) {
    const current = new Date(date);
    const month = current.getUTCMonth();
    const bucket =
      frequency === "monthly"
        ? `${current.getUTCFullYear()}-${month}`
        : `${current.getUTCFullYear()}-${Math.floor(month / 3)}`;

    if (bucket !== previousBucket) {
      selected.push(date);
      previousBucket = bucket;
    }
  }

  return selected;
}

function priceOnOrBefore(candles: Candle[], date: string) {
  const target = new Date(date).getTime();

  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (new Date(candles[index].date).getTime() <= target) {
      return candles[index].adjustedClose ?? candles[index].close;
    }
  }

  return undefined;
}

function candlesUntil(candles: Candle[], date: string) {
  const target = new Date(date).getTime();

  return candles
    .filter((candle) => new Date(candle.date).getTime() <= target)
    .slice(-TRAILING_CANDLE_COUNT);
}

function normalizeAllocations(allocations: { symbol: string; weight: number }[]) {
  return Object.fromEntries(
    allocations.map((allocation) => [
      allocation.symbol,
      allocation.weight / 100,
    ])
  ) as WeightMap;
}

function calculateTurnover(previous: WeightMap, next: WeightMap) {
  const symbols = new Set([...Object.keys(previous), ...Object.keys(next)]);
  let diff = 0;

  for (const symbol of symbols) {
    diff += Math.abs((next[symbol] ?? 0) - (previous[symbol] ?? 0));
  }

  return diff / 2;
}

function maxWeightDifference(previous: WeightMap, next: WeightMap) {
  const symbols = new Set([...Object.keys(previous), ...Object.keys(next)]);
  let maxDiff = 0;

  for (const symbol of symbols) {
    maxDiff = Math.max(maxDiff, Math.abs((next[symbol] ?? 0) - (previous[symbol] ?? 0)));
  }

  return maxDiff;
}

function currentDriftedWeights(input: {
  activeWeights: WeightMap;
  activeBasePrices: Record<string, number>;
  candlesBySymbol: CandleMap;
  date: string;
}) {
  const weightedValues = Object.entries(input.activeWeights).flatMap(
    ([symbol, weight]): Array<[string, number]> => {
      const basePrice = input.activeBasePrices[symbol];
      const currentPrice = priceOnOrBefore(input.candlesBySymbol[symbol] ?? [], input.date);

      if (!basePrice || !currentPrice) {
        return [];
      }

      return [[symbol, weight * (currentPrice / basePrice)]];
    }
  );
  const total = weightedValues.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    return input.activeWeights;
  }

  return Object.fromEntries(
    weightedValues.map(([symbol, value]) => [symbol, value / total])
  ) as WeightMap;
}

function calculateDrawdown(value: number, peak: number) {
  if (peak <= 0) {
    return 0;
  }

  return ((value / peak) - 1) * 100;
}

function summarizeCurve(
  config: BacktestConfig,
  equityCurve: BacktestPoint[],
  rebalances: RebalanceEvent[]
) {
  const startValue = config.initialCapital;
  const endValue = equityCurve.at(-1)?.portfolioValue ?? startValue;
  const start = new Date(config.startDate).getTime();
  const end = new Date(config.endDate).getTime();
  const years = Math.max((end - start) / (365.25 * 24 * 60 * 60 * 1000), 1 / 365);
  const dailyReturns: number[] = [];

  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = equityCurve[index - 1].portfolioValue;
    const current = equityCurve[index].portfolioValue;

    if (previous > 0) {
      dailyReturns.push((current / previous) - 1);
    }
  }

  const mean =
    dailyReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(dailyReturns.length, 1);
  const variance =
    dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(dailyReturns.length - 1, 1);
  const turnover = rebalances.reduce(
    (sum, rebalance) => sum + rebalance.turnover,
    0
  );
  const annualizedVolatility =
    Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
  const cagr = ((endValue / startValue) ** (1 / years) - 1) * 100;
  const maxDrawdown = Math.min(...equityCurve.map((point) => point.drawdown), 0);
  const annualizedReturn = mean * TRADING_DAYS_PER_YEAR;
  const annualizedStd = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const sharpeRatio = annualizedStd > 0 ? annualizedReturn / annualizedStd : 0;
  const calmarRatio = maxDrawdown < 0 ? cagr / Math.abs(maxDrawdown) : 0;

  return {
    startValue,
    endValue,
    totalReturn: ((endValue / startValue) - 1) * 100,
    cagr,
    maxDrawdown,
    annualizedVolatility,
    sharpeRatio,
    calmarRatio,
    rebalanceCount: rebalances.length,
    turnover,
    averageTurnover: rebalances.length > 0 ? turnover / rebalances.length : 0,
  };
}

function benchmarkCurve(input: {
  symbol: string;
  candles: Candle[];
  config: BacktestConfig;
}) {
  const start = new Date(input.config.startDate).getTime();
  const end = new Date(input.config.endDate).getTime();
  const candles = input.candles.filter((candle) => {
    const time = new Date(candle.date).getTime();
    return time >= start && time <= end;
  });
  const first = candles[0];

  if (!first || candles.length < 2) {
    return undefined;
  }

  const basePrice = first.adjustedClose ?? first.close;
  let peak = input.config.initialCapital;

  const equityCurve = candles.flatMap((candle): BacktestPoint[] => {
    const currentPrice = candle.adjustedClose ?? candle.close;

    if (!basePrice || !currentPrice) {
      return [];
    }

    const portfolioValue = input.config.initialCapital * (currentPrice / basePrice);
    peak = Math.max(peak, portfolioValue);

    return [
      {
        date: dateKey(candle.date),
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        drawdown: Math.round(calculateDrawdown(portfolioValue, peak) * 100) / 100,
      },
    ];
  });

  const summary = summarizeCurve(input.config, equityCurve, []);

  return {
    symbol: input.symbol,
    totalReturn: summary.totalReturn,
    cagr: summary.cagr,
    maxDrawdown: summary.maxDrawdown,
    annualizedVolatility: summary.annualizedVolatility,
    sharpeRatio: summary.sharpeRatio,
  };
}

export async function runBacktest(
  config: BacktestConfig,
  provider: MarketDataProvider
): Promise<BacktestResult> {
  const warnings: string[] = [];
  const candlesBySymbol: CandleMap = {};
  const symbolsToFetch = Array.from(
    new Set([...config.symbols, config.benchmarkSymbol].filter(Boolean))
  );

  for (const symbol of symbolsToFetch) {
    candlesBySymbol[symbol] = await provider.getHistoricalDailyCandles({
      symbol,
      startDate: config.startDate,
      endDate: config.endDate,
    });

    if (candlesBySymbol[symbol].length < 2) {
      warnings.push(`${symbol} has insufficient historical candles.`);
    }
  }

  let normalizedCandlesBySymbol = candlesBySymbol;

  if (config.returnBasis === "krwInvestor") {
    try {
      const fxCandles = await provider.getHistoricalDailyCandles({
        symbol: USD_KRW_SYMBOL,
        startDate: config.startDate,
        endDate: config.endDate,
      });
      const normalized = normalizeCandlesForReturnBasis(candlesBySymbol, {
        returnBasis: config.returnBasis,
        fxCandles,
      });

      normalizedCandlesBySymbol = normalized.candlesBySymbol;
      warnings.push(...normalized.warnings);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown FX data error.";
      warnings.push(
        `USD/KRW FX data was unavailable, so backtest prices stayed in local listing currencies: ${message}`
      );
    }
  } else {
    const normalized = normalizeCandlesForReturnBasis(candlesBySymbol, {
      returnBasis: config.returnBasis,
    });

    normalizedCandlesBySymbol = normalized.candlesBySymbol;
    warnings.push(...normalized.warnings);
  }

  const dates = tradingDays(
    normalizedCandlesBySymbol,
    config.startDate,
    config.endDate
  );
  const decisionDates = rebalanceDates(dates, config.rebalanceFrequency);

  if (dates.length < 2 || decisionDates.length === 0) {
    throw new Error("Not enough historical data for the selected backtest range.");
  }

  let portfolioValue = config.initialCapital;
  let peak = portfolioValue;
  let previousWeights: WeightMap = {};
  const equityCurve: BacktestPoint[] = [
    {
      date: dateKey(dates[0]),
      portfolioValue,
      drawdown: 0,
    },
  ];
  const rebalances: RebalanceEvent[] = [];
  const costRate = (config.transactionCostBps + config.slippageBps) / 10_000;
  let activeWeights: WeightMap = {};
  let activeBasePrices: Record<string, number> = {};
  let rebalanceBaseValue = portfolioValue;
  const rebalanceSet = new Set(decisionDates);

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];

    if (rebalanceSet.has(date)) {
      const trailingBySymbol = Object.fromEntries(
        config.symbols.map((symbol) => [
          symbol,
          candlesUntil(normalizedCandlesBySymbol[symbol] ?? [], date),
        ])
      );
      const rows = buildEtfRowsFromCandles(trailingBySymbol, {
        returnBasis: config.returnBasis,
        returnCurrency: config.returnBasis === "krwInvestor" ? "KRW" : "LOCAL",
      }).filter((row) => row.dataQuality.status !== "excluded");

      if (rows.length > 0) {
        const scores = calculateEtfScores(
          rows,
          getStrategyPreset(config.strategy).weights
        );
        const recommendation = buildPortfolioRecommendation(
          scores,
          config.strategy
        );
        const nextWeights = normalizeAllocations(recommendation.allocations);
        const driftedWeights = currentDriftedWeights({
          activeWeights,
          activeBasePrices,
          candlesBySymbol: normalizedCandlesBySymbol,
          date,
        });
        const comparisonWeights =
          Object.keys(driftedWeights).length > 0 ? driftedWeights : previousWeights;
        const maxDrift = maxWeightDifference(comparisonWeights, nextWeights);
        const shouldRebalance =
          rebalances.length === 0 ||
          config.rebalanceMode === "scheduled" ||
          maxDrift >= config.driftThresholdPct / 100;

        if (shouldRebalance) {
          const turnover = calculateTurnover(comparisonWeights, nextWeights);
          const cost = portfolioValue * turnover * costRate;

          portfolioValue -= cost;
          rebalanceBaseValue = portfolioValue;
          previousWeights = nextWeights;
          activeWeights = nextWeights;
          activeBasePrices = Object.fromEntries(
            Object.keys(activeWeights).flatMap((symbol) => {
              const price = priceOnOrBefore(
                normalizedCandlesBySymbol[symbol] ?? [],
                date
              );
              return price ? [[symbol, price]] : [];
            })
          );
          rebalances.push({
            date: dateKey(date),
            allocations: recommendation.allocations,
            scores,
            turnover,
            cost,
          });
        }
      }
    }

    if (Object.keys(activeWeights).length === 0) {
      continue;
    }

    let periodReturn = 0;

    for (const [symbol, weight] of Object.entries(activeWeights)) {
      const basePrice = activeBasePrices[symbol];
      const currentPrice = priceOnOrBefore(
        normalizedCandlesBySymbol[symbol] ?? [],
        date
      );

      if (basePrice && currentPrice) {
        periodReturn += weight * ((currentPrice / basePrice) - 1);
      }
    }

    const currentValue = rebalanceBaseValue * (1 + periodReturn);

    peak = Math.max(peak, currentValue);
    portfolioValue = currentValue;
    equityCurve.push({
      date: dateKey(date),
      portfolioValue: Math.round(currentValue * 100) / 100,
      drawdown: Math.round(calculateDrawdown(currentValue, peak) * 100) / 100,
    });
  }

  const summary = summarizeCurve(config, equityCurve, rebalances);
  const benchmark = benchmarkCurve({
    symbol: config.benchmarkSymbol,
    candles: normalizedCandlesBySymbol[config.benchmarkSymbol] ?? [],
    config,
  });

  return {
    config,
    provider: provider.id,
    summary,
    benchmark: benchmark
      ? {
          ...benchmark,
          excessCagr: summary.cagr - benchmark.cagr,
        }
      : undefined,
    equityCurve,
    rebalances,
    assumptions: [
      "Uses historical daily close prices from the configured free EOD API.",
      config.returnBasis === "krwInvestor"
        ? "USD-listed ETF prices are converted to KRW with USD/KRW EOD rates before scoring and simulation."
        : "Each ETF is evaluated in its own listing currency; mixed-market results are not FX-normalized.",
      "Rebalance decisions use only candles available on or before each rebalance date.",
      "Scores and portfolio recommendation rules are frozen to the current app logic for this run.",
      "Results are hypothetical historical scenarios, not investment advice.",
    ],
    warnings,
  };
}
