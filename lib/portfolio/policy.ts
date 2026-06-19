import type { EtfRole, EtfScore, MarketRegimeType } from "@/types/etf";
import type { StrategyPolicy, TargetAllocation } from "@/types/portfolio";

export const DEFAULT_POLICY: StrategyPolicy = {
  id: "balanced-core-satellite",
  name: "Balanced Core-Satellite",
  riskProfile: "balanced",
  rebalanceFrequency: "quarterly",
  driftThresholdPct: 5,
  minLiquidityScore: 75,
  maxSingleEtfWeight: 55,
  cashBufferPct: 2,
};

const ROLE_BUCKETS: Record<MarketRegimeType, Partial<Record<EtfRole, number>>> = {
  riskOn: {
    equityCore: 55,
    equityGrowth: 15,
    bondDefensive: 20,
    goldHedge: 10,
  },
  neutral: {
    equityCore: 40,
    equityGrowth: 10,
    bondDefensive: 35,
    goldHedge: 15,
  },
  riskOff: {
    cashLike: 45,
    bondDefensive: 35,
    goldHedge: 20,
  },
};

const SATELLITE_ROLES = new Set<EtfRole>(["equityGrowth", "sectorSatellite"]);

function bucketForRole(role: EtfRole) {
  return SATELLITE_ROLES.has(role) ? "equityGrowth" : role;
}

function roundPct(value: number) {
  return Math.round(value * 10) / 10;
}

export function filterPortfolioCandidates(scores: EtfScore[], policy = DEFAULT_POLICY) {
  return scores.filter(
    (score) =>
      score.market === "US" &&
      score.dataQuality.status !== "excluded" &&
      score.liquidityScore >= policy.minLiquidityScore
  );
}

export function buildTargetAllocations(input: {
  scores: EtfScore[];
  marketRegime: MarketRegimeType;
  policy?: StrategyPolicy;
}): TargetAllocation[] {
  const policy = input.policy ?? DEFAULT_POLICY;
  const roleTargets = ROLE_BUCKETS[input.marketRegime];
  const candidates = filterPortfolioCandidates(input.scores, policy);
  const allocations: TargetAllocation[] = [];

  for (const [role, targetWeight] of Object.entries(roleTargets) as [
    EtfRole,
    number,
  ][]) {
    const matching = candidates
      .filter((score) => bucketForRole(score.role) === role)
      .sort((a, b) => b.totalScore - a.totalScore);
    const selected = matching.slice(0, Math.ceil(targetWeight / policy.maxSingleEtfWeight));

    if (selected.length === 0) {
      continue;
    }

    let remaining = targetWeight;

    selected.forEach((score, index) => {
      const weight =
        index === selected.length - 1
          ? remaining
          : Math.min(policy.maxSingleEtfWeight, targetWeight / selected.length);
      remaining = roundPct(remaining - weight);
      allocations.push({
        policyId: policy.id,
        symbol: score.symbol,
        targetWeightPct: roundPct(weight),
        role: score.role,
        rationale: `${score.symbol} leads its role group with a ${score.totalScore.toFixed(
          1
        )} relative score.`,
      });
    });
  }

  const total = allocations.reduce((sum, item) => sum + item.targetWeightPct, 0);

  if (allocations.length > 0 && total !== 100) {
    allocations[allocations.length - 1] = {
      ...allocations[allocations.length - 1],
      targetWeightPct: roundPct(
        allocations[allocations.length - 1].targetWeightPct + (100 - total)
      ),
    };
  }

  return allocations;
}
