import type { EtfScore, PortfolioAllocation, StrategyType } from "./etf";
import type { ReturnBasis } from "./etf";

export type RebalanceFrequency = "monthly" | "quarterly";
export type RebalanceMode = "scheduled" | "threshold";

export type BacktestConfig = {
  symbols: string[];
  strategy: StrategyType;
  startDate: string;
  endDate: string;
  rebalanceFrequency: RebalanceFrequency;
  rebalanceMode: RebalanceMode;
  driftThresholdPct: number;
  returnBasis: ReturnBasis;
  initialCapital: number;
  transactionCostBps: number;
  slippageBps: number;
  benchmarkSymbol: string;
};

export type BacktestPoint = {
  date: string;
  portfolioValue: number;
  drawdown: number;
};

export type RebalanceEvent = {
  date: string;
  allocations: PortfolioAllocation[];
  scores: EtfScore[];
  turnover: number;
  cost: number;
};

export type BacktestResult = {
  config: BacktestConfig;
  provider: string;
  summary: {
    startValue: number;
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
  };
  benchmark?: {
    symbol: string;
    totalReturn: number;
    cagr: number;
    maxDrawdown: number;
    annualizedVolatility: number;
    sharpeRatio: number;
    excessCagr: number;
  };
  equityCurve: BacktestPoint[];
  rebalances: RebalanceEvent[];
  assumptions: string[];
  warnings: string[];
};
