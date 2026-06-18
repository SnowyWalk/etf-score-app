export type EtfCategory = "equity" | "sector" | "bond" | "gold" | "cash";

export type EtfMarket = "US" | "KR";

export type CurrencyHedge = "hedged" | "unhedged" | "partial" | "unknown";

export type ReturnBasis = "krwInvestor" | "localPrice";

export type EtfRole =
  | "equityCore"
  | "equityGrowth"
  | "sectorSatellite"
  | "goldHedge"
  | "bondDefensive"
  | "cashLike";

export type StrategyType = "aggressive" | "balanced" | "defensive";

export type ScoreWeights = {
  momentum: number;
  stability: number;
  diversification: number;
  product: number;
  cost: number;
};

export type EtfRawData = {
  symbol: string;
  name: string;
  market: EtfMarket;
  listingCurrency: string;
  baseExposureCurrency: string;
  currencyHedge: CurrencyHedge;
  returnBasis: ReturnBasis;
  returnCurrency: string;
  category: EtfCategory;
  role: EtfRole;
  return1M: number;
  return3M: number;
  return6M: number;
  return12M: number;
  returnYTD?: number;
  volatility: number;
  expenseRatio: number;
  liquidityScore: number;
  diversificationScore: number;
};

export type Grade = "A" | "B" | "C" | "D";

export type Recommendation = "BUY" | "HOLD" | "WATCH" | "AVOID";

export type EtfScore = EtfRawData & {
  momentumRaw: number;
  momentumScore: number;
  stabilityScore: number;
  productScore: number;
  costScore: number;
  totalScore: number;
  grade: Grade;
  recommendation: Recommendation;
  summary: string;
};

export type StrategyPreset = {
  type: StrategyType;
  label: string;
  shortLabel: string;
  description: string;
  weights: ScoreWeights;
};

export type PortfolioAllocation = {
  symbol: string;
  name: string;
  role: EtfRole;
  weight: number;
  totalScore: number;
  rationale: string;
};

export type PortfolioRecommendation = {
  strategy: StrategyType;
  description: string;
  allocations: PortfolioAllocation[];
};
