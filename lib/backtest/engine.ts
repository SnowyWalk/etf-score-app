import type {
  BacktestConfig,
  BacktestPoint,
  BacktestResult,
  RebalanceEvent,
} from "../../types/backtest";
import type { Candle, MarketDataProvider } from "../../types/market";
import { buildEtfRowsFromCandles } from "../market-data/metrics";
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

  return {
    startValue,
    endValue,
    totalReturn: ((endValue / startValue) - 1) * 100,
    cagr: ((endValue / startValue) ** (1 / years) - 1) * 100,
    maxDrawdown: Math.min(...equityCurve.map((point) => point.drawdown), 0),
    annualizedVolatility: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    rebalanceCount: rebalances.length,
    turnover,
  };
}

export async function runBacktest(
  config: BacktestConfig,
  provider: MarketDataProvider
): Promise<BacktestResult> {
  const warnings: string[] = [];
  const candlesBySymbol: CandleMap = {};

  for (const symbol of config.symbols) {
    candlesBySymbol[symbol] = await provider.getHistoricalDailyCandles({
      symbol,
      startDate: config.startDate,
      endDate: config.endDate,
    });

    if (candlesBySymbol[symbol].length < 2) {
      warnings.push(`${symbol} has insufficient historical candles.`);
    }
  }

  const dates = tradingDays(candlesBySymbol, config.startDate, config.endDate);
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
        Object.entries(candlesBySymbol).map(([symbol, candles]) => [
          symbol,
          candlesUntil(candles, date),
        ])
      );
      const rows = buildEtfRowsFromCandles(trailingBySymbol);

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
        const turnover = calculateTurnover(previousWeights, nextWeights);
        const cost = portfolioValue * turnover * costRate;

        portfolioValue -= cost;
        rebalanceBaseValue = portfolioValue;
        previousWeights = nextWeights;
        activeWeights = nextWeights;
        rebalances.push({
          date: dateKey(date),
          allocations: recommendation.allocations,
          scores,
          turnover,
          cost,
        });
      }

      activeBasePrices = Object.fromEntries(
        Object.keys(activeWeights).flatMap((symbol) => {
          const price = priceOnOrBefore(candlesBySymbol[symbol] ?? [], date);
          return price ? [[symbol, price]] : [];
        })
      );
    }

    if (Object.keys(activeWeights).length === 0) {
      continue;
    }

    let periodReturn = 0;

    for (const [symbol, weight] of Object.entries(activeWeights)) {
      const basePrice = activeBasePrices[symbol];
      const currentPrice = priceOnOrBefore(candlesBySymbol[symbol] ?? [], date);

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

  return {
    config,
    provider: provider.id,
    summary: summarizeCurve(config, equityCurve, rebalances),
    equityCurve,
    rebalances,
    assumptions: [
      "Uses historical daily close prices from the configured free EOD API.",
      "Rebalance decisions use only candles available on or before each rebalance date.",
      "Scores and portfolio recommendation rules are frozen to the current app logic for this run.",
      "Results are hypothetical historical scenarios, not investment advice.",
    ],
    warnings,
  };
}
