import type { StrategyPreset, StrategyType } from "../types/etf";

export const strategyPresets: Record<StrategyType, StrategyPreset> = {
  aggressive: {
    type: "aggressive",
    label: "공격형",
    shortLabel: "Aggressive",
    description: "최근 추세가 강한 ETF를 더 크게 반영합니다.",
    weights: {
      momentum: 60,
      stability: 10,
      diversification: 10,
      product: 10,
      cost: 10,
    },
  },
  balanced: {
    type: "balanced",
    label: "균형형",
    shortLabel: "Balanced",
    description: "수익 추세, 안정성, 분산 효과를 균형 있게 봅니다.",
    weights: {
      momentum: 45,
      stability: 20,
      diversification: 15,
      product: 10,
      cost: 10,
    },
  },
  defensive: {
    type: "defensive",
    label: "방어형",
    shortLabel: "Defensive",
    description: "변동성 안정성과 분산 효과를 더 중시합니다.",
    weights: {
      momentum: 25,
      stability: 35,
      diversification: 20,
      product: 10,
      cost: 10,
    },
  },
};

export const strategyOrder: StrategyType[] = [
  "aggressive",
  "balanced",
  "defensive",
];

export function getStrategyPreset(strategy: StrategyType) {
  return strategyPresets[strategy];
}
