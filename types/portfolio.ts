import type { EtfRole, MarketRegimeType } from "./etf";

export type RiskProfile = "balanced";
export type RebalanceFrequency = "monthly" | "quarterly";
export type TradeSide = "buy" | "sell";
export type ExecutionSource = "manual" | "toss";
export type RebalanceStatus = "draft" | "approved" | "executed" | "skipped";
export type OrderStatus = "draft" | "blocked" | "recorded" | "submitted" | "failed";

export type StrategyPolicy = {
  id: string;
  name: string;
  riskProfile: RiskProfile;
  rebalanceFrequency: RebalanceFrequency;
  driftThresholdPct: number;
  minLiquidityScore: number;
  maxSingleEtfWeight: number;
  cashBufferPct: number;
};

export type TargetAllocation = {
  policyId: string;
  symbol: string;
  targetWeightPct: number;
  role: EtfRole;
  rationale: string;
};

export type Position = {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currency: string;
  updatedAt: string;
};

export type ManualTrade = {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  currency: string;
  tradeDate: string;
  fee: number;
  fxRate: number;
  source: ExecutionSource;
};

export type TradePlanLine = {
  symbol: string;
  name: string;
  role: EtfRole;
  side: TradeSide;
  targetWeightPct: number;
  targetAmount: number;
  currentAmount: number;
  driftPct: number;
  estimatedPrice: number;
  suggestedQuantity: number;
  estimatedAmount: number;
  estimatedCashLeft: number;
  status: OrderStatus;
  rationale: string;
};

export type TradePlan = {
  mode: "newCash" | "rebalance";
  asOf: string;
  marketRegime: MarketRegimeType;
  isNewCashBlocked: boolean;
  investmentAmount: number;
  totalPortfolioValue: number;
  cashBufferAmount: number;
  availableAmount: number;
  driftThresholdPct: number;
  lines: TradePlanLine[];
  message: string;
};

export type PortfolioState = {
  policy: StrategyPolicy;
  positions: Position[];
  manualTrades: ManualTrade[];
};
