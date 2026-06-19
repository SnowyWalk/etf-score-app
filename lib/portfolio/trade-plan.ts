import type { EtfScore, MarketRegimeType } from "@/types/etf";
import type {
  Position,
  StrategyPolicy,
  TargetAllocation,
  TradePlan,
  TradePlanLine,
} from "@/types/portfolio";

const FALLBACK_PRICE_BY_ROLE: Record<string, number> = {
  equityCore: 500,
  equityGrowth: 420,
  sectorSatellite: 230,
  bondDefensive: 95,
  goldHedge: 240,
  cashLike: 82,
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.max(0, Math.floor(value * 10000) / 10000);
}

export function estimateEtfPrice(score: EtfScore) {
  if (score.latestPrice && score.latestPrice > 0) {
    return roundMoney(score.latestPrice);
  }

  const returnAdjusted =
    1 + Math.max(-0.35, Math.min(0.6, score.return12M / 100));
  return roundMoney((FALLBACK_PRICE_BY_ROLE[score.role] ?? 100) * returnAdjusted);
}

export function buildNewCashTradePlan(input: {
  amount: number;
  marketRegime: MarketRegimeType;
  policy: StrategyPolicy;
  allocations: TargetAllocation[];
  scores: EtfScore[];
}): TradePlan {
  const cashBufferAmount = roundMoney(input.amount * (input.policy.cashBufferPct / 100));
  const availableAmount = Math.max(0, roundMoney(input.amount - cashBufferAmount));
  const scoreBySymbol = new Map(input.scores.map((score) => [score.symbol, score]));

  if (input.marketRegime === "riskOff") {
    return {
      mode: "newCash",
      asOf: new Date().toISOString(),
      marketRegime: input.marketRegime,
      isNewCashBlocked: true,
      investmentAmount: input.amount,
      totalPortfolioValue: 0,
      cashBufferAmount,
      availableAmount,
      driftThresholdPct: input.policy.driftThresholdPct,
      lines: [],
      message: "Risk-Off: relative ETF scores are shown, but new buying is on hold.",
    };
  }

  let spent = 0;
  const lines = input.allocations.map((allocation): TradePlanLine => {
    const score = scoreBySymbol.get(allocation.symbol);
    const estimatedPrice = score ? estimateEtfPrice(score) : 100;
    const targetAmount = roundMoney(
      availableAmount * (allocation.targetWeightPct / 100)
    );
    const suggestedQuantity = roundQuantity(targetAmount / estimatedPrice);
    const estimatedAmount = roundMoney(suggestedQuantity * estimatedPrice);
    spent += estimatedAmount;

    return {
      symbol: allocation.symbol,
      name: score?.name ?? allocation.symbol,
      role: allocation.role,
      side: "buy",
      targetWeightPct: allocation.targetWeightPct,
      targetAmount,
      currentAmount: 0,
      driftPct: allocation.targetWeightPct,
      estimatedPrice,
      suggestedQuantity,
      estimatedAmount,
      estimatedCashLeft: 0,
      status: "draft",
      rationale: allocation.rationale,
    };
  });

  return {
    mode: "newCash",
    asOf: new Date().toISOString(),
    marketRegime: input.marketRegime,
    isNewCashBlocked: false,
    investmentAmount: input.amount,
    totalPortfolioValue: 0,
    cashBufferAmount,
    availableAmount,
    driftThresholdPct: input.policy.driftThresholdPct,
    lines: lines.map((line) => ({
      ...line,
      estimatedCashLeft: roundMoney(availableAmount - spent),
    })),
    message: "Manual mode: place these orders yourself, then record actual fills.",
  };
}

export function buildRebalanceTradePlan(input: {
  positions: Position[];
  policy: StrategyPolicy;
  allocations: TargetAllocation[];
  scores: EtfScore[];
  marketRegime: MarketRegimeType;
}): TradePlan {
  const scoreBySymbol = new Map(input.scores.map((score) => [score.symbol, score]));
  const symbols = new Set([
    ...input.allocations.map((allocation) => allocation.symbol),
    ...input.positions.map((position) => position.symbol),
  ]);
  const values = new Map<string, number>();

  for (const position of input.positions) {
    const score = scoreBySymbol.get(position.symbol);
    const price = score ? estimateEtfPrice(score) : position.avgPrice;
    values.set(position.symbol, roundMoney(position.quantity * price));
  }

  const totalPortfolioValue = Array.from(values.values()).reduce(
    (sum, value) => sum + value,
    0
  );
  const allocationBySymbol = new Map(
    input.allocations.map((allocation) => [allocation.symbol, allocation])
  );

  const lines = Array.from(symbols)
    .map((symbol): TradePlanLine | undefined => {
      const allocation = allocationBySymbol.get(symbol);
      const score = scoreBySymbol.get(symbol);
      const targetWeightPct = allocation?.targetWeightPct ?? 0;
      const currentAmount = values.get(symbol) ?? 0;
      const currentWeightPct =
        totalPortfolioValue > 0 ? (currentAmount / totalPortfolioValue) * 100 : 0;
      const driftPct = Math.round((targetWeightPct - currentWeightPct) * 10) / 10;

      if (Math.abs(driftPct) < input.policy.driftThresholdPct) {
        return undefined;
      }

      const estimatedPrice = score ? estimateEtfPrice(score) : 100;
      const targetAmount = roundMoney(
        totalPortfolioValue * (targetWeightPct / 100)
      );
      const amountDelta = roundMoney(targetAmount - currentAmount);
      const suggestedQuantity = roundQuantity(Math.abs(amountDelta) / estimatedPrice);

      return {
        symbol,
        name: score?.name ?? symbol,
        role: allocation?.role ?? score?.role ?? "equityCore",
        side: amountDelta >= 0 ? "buy" : "sell",
        targetWeightPct,
        targetAmount,
        currentAmount,
        driftPct,
        estimatedPrice,
        suggestedQuantity,
        estimatedAmount: roundMoney(suggestedQuantity * estimatedPrice),
        estimatedCashLeft: 0,
        status: "draft",
        rationale:
          allocation?.rationale ??
          "Position is outside the current target portfolio and should be reviewed.",
      };
    })
    .filter((line): line is TradePlanLine => Boolean(line));

  return {
    mode: "rebalance",
    asOf: new Date().toISOString(),
    marketRegime: input.marketRegime,
    isNewCashBlocked: false,
    investmentAmount: 0,
    totalPortfolioValue: roundMoney(totalPortfolioValue),
    cashBufferAmount: 0,
    availableAmount: totalPortfolioValue,
    driftThresholdPct: input.policy.driftThresholdPct,
    lines,
    message:
      lines.length > 0
        ? "Draft rebalance orders are based on stored manual positions."
        : "No rebalance needed: all stored positions are inside the drift threshold.",
  };
}
