import type { EtfScore, PortfolioAllocation, StrategyType } from "./etf";
import type { ReturnBasis } from "./etf";

export type RebalanceFrequency = "monthly" | "quarterly";

export type BacktestConfig = {
  symbols: string[];
  strategy: StrategyType;
  startDate: string;
  endDate: string;
  rebalanceFrequency: RebalanceFrequency;
  returnBasis: ReturnBasis;
  initialCapital: number;
  transactionCostBps: number;
  slippageBps: number;
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
    rebalanceCount: number;
    turnover: number;
  };
  equityCurve: BacktestPoint[];
  rebalances: RebalanceEvent[];
  assumptions: string[];
  warnings: string[];
};
