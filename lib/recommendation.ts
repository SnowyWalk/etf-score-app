import { strategyPresets } from "./strategy-presets";
import type {
  EtfRole,
  EtfScore,
  PortfolioAllocation,
  PortfolioRecommendation,
  StrategyType,
} from "../types/etf";

const allocationTemplates: Record<StrategyType, Partial<Record<EtfRole, number>>> = {
  aggressive: {
    equityGrowth: 60,
    goldHedge: 25,
    bondDefensive: 15,
  },
  balanced: {
    equityCore: 50,
    goldHedge: 25,
    bondDefensive: 25,
  },
  defensive: {
    equityCore: 40,
    goldHedge: 30,
    bondDefensive: 30,
  },
};

const roleLabels: Record<EtfRole, string> = {
  equityCore: "핵심 주식 노출",
  equityGrowth: "성장 주식 노출",
  sectorSatellite: "섹터 보조 노출",
  goldHedge: "금 헤지 노출",
  bondDefensive: "장기채 방어 노출",
  cashLike: "현금성 노출",
};

function sortCandidates(scores: EtfScore[]) {
  return [...scores].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.symbol.localeCompare(b.symbol);
  });
}

function findCandidate(
  scores: EtfScore[],
  selectedSymbols: Set<string>,
  targetRole: EtfRole
) {
  const sorted = sortCandidates(scores);
  const exact = sorted.find(
    (score) => score.role === targetRole && !selectedSymbols.has(score.symbol)
  );

  if (exact) {
    return exact;
  }

  const nonSector = sorted.find(
    (score) =>
      score.role !== "sectorSatellite" && !selectedSymbols.has(score.symbol)
  );

  if (nonSector) {
    return nonSector;
  }

  const sectorAlreadySelected = sorted.some(
    (score) =>
      selectedSymbols.has(score.symbol) && score.role === "sectorSatellite"
  );

  return sorted.find(
    (score) =>
      !selectedSymbols.has(score.symbol) &&
      (!sectorAlreadySelected || score.role !== "sectorSatellite")
  );
}

function normalizeWholePercentWeights(items: PortfolioAllocation[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);

  if (total <= 0) {
    return items;
  }

  const normalized = items.map((item) => ({
    ...item,
    weight: Math.round((item.weight / total) * 100),
  }));

  const diff =
    100 - normalized.reduce((sum, item) => sum + item.weight, 0);

  if (diff !== 0 && normalized.length > 0) {
    normalized[0] = {
      ...normalized[0],
      weight: normalized[0].weight + diff,
    };
  }

  return normalized;
}

export function buildPortfolioRecommendation(
  scores: EtfScore[],
  strategy: StrategyType
): PortfolioRecommendation {
  const template = allocationTemplates[strategy];
  const selectedSymbols = new Set<string>();
  const allocations: PortfolioAllocation[] = [];

  for (const [role, weight] of Object.entries(template) as [
    EtfRole,
    number,
  ][]) {
    const candidate = findCandidate(scores, selectedSymbols, role);

    if (!candidate) {
      continue;
    }

    selectedSymbols.add(candidate.symbol);
    allocations.push({
      symbol: candidate.symbol,
      name: candidate.name,
      role: candidate.role,
      weight,
      totalScore: candidate.totalScore,
      rationale: roleLabels[candidate.role],
    });
  }

  return {
    strategy,
    description: strategyPresets[strategy].description,
    allocations: normalizeWholePercentWeights(allocations),
  };
}

export function getRoleLabel(role: EtfRole) {
  return roleLabels[role];
}
