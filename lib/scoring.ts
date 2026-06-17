import { generateSummary } from "./summary";
import type {
  EtfRawData,
  EtfScore,
  Grade,
  Recommendation,
  ScoreWeights,
} from "../types/etf";

type Direction = "direct" | "inverse";

export function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function normalizeValues(values: number[], direction: Direction) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return values.map(() => 50);
  }

  return values.map((value) => {
    const ratio =
      direction === "direct"
        ? (value - min) / (max - min)
        : (max - value) / (max - min);

    return clampScore(ratio * 100);
  });
}

export function calculateMomentumRaw(etf: EtfRawData) {
  return (
    etf.return1M * 0.15 +
    etf.return3M * 0.25 +
    etf.return6M * 0.25 +
    etf.return12M * 0.35
  );
}

export function getGrade(totalScore: number): Grade {
  if (totalScore >= 80) return "A";
  if (totalScore >= 70) return "B";
  if (totalScore >= 60) return "C";
  return "D";
}

export function getRecommendation(totalScore: number): Recommendation {
  if (totalScore >= 75) return "BUY";
  if (totalScore >= 65) return "HOLD";
  if (totalScore >= 50) return "WATCH";
  return "AVOID";
}

export function getRecommendationLabel(recommendation: Recommendation) {
  const labels: Record<Recommendation, string> = {
    BUY: "편입 후보",
    HOLD: "보유 후보",
    WATCH: "관찰",
    AVOID: "보류",
  };

  return labels[recommendation];
}

export function sortScores(scores: EtfScore[]) {
  return [...scores].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

export function calculateEtfScores(
  etfs: EtfRawData[],
  weights: ScoreWeights
): EtfScore[] {
  if (etfs.length === 0) {
    return [];
  }

  const momentumRaw = etfs.map(calculateMomentumRaw);
  const momentumScores = normalizeValues(momentumRaw, "direct");
  const stabilityScores = normalizeValues(
    etfs.map((etf) => etf.volatility),
    "inverse"
  );
  const diversificationScores = normalizeValues(
    etfs.map((etf) => etf.diversificationScore),
    "direct"
  );
  const productScores = normalizeValues(
    etfs.map((etf) => etf.liquidityScore),
    "direct"
  );
  const costScores = normalizeValues(
    etfs.map((etf) => etf.expenseRatio),
    "inverse"
  );

  const scored = etfs.map((etf, index) => {
    const partial = {
      ...etf,
      momentumRaw: momentumRaw[index],
      momentumScore: momentumScores[index],
      stabilityScore: stabilityScores[index],
      diversificationScore: diversificationScores[index],
      productScore: productScores[index],
      costScore: costScores[index],
    };

    const totalScore =
      partial.momentumScore * (weights.momentum / 100) +
      partial.stabilityScore * (weights.stability / 100) +
      partial.diversificationScore * (weights.diversification / 100) +
      partial.productScore * (weights.product / 100) +
      partial.costScore * (weights.cost / 100);
    const roundedTotal = Math.round(totalScore * 10) / 10;

    const baseScore = {
      ...partial,
      totalScore: roundedTotal,
      grade: getGrade(roundedTotal),
      recommendation: getRecommendation(roundedTotal),
    };

    return {
      ...baseScore,
      summary: generateSummary(baseScore),
    };
  });

  return sortScores(scored);
}
