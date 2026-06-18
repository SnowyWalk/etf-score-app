import { generateSummary } from "./summary";
import type {
  EtfRawData,
  EtfScore,
  Grade,
  Recommendation,
  ScoreWeights,
} from "../types/etf";

type Direction = "direct" | "inverse";
type NormalizeOptions = {
  minScore?: number;
};

export function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function normalizeValues(
  values: number[],
  direction: Direction,
  options: NormalizeOptions = {}
) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return values.map(() => 50);
  }

  const minScore = options.minScore ?? 0;

  return values.map((value) => {
    const ratio =
      direction === "direct"
        ? (value - min) / (max - min)
        : (max - value) / (max - min);

    return clampScore(minScore + ratio * (100 - minScore));
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
  if (totalScore >= 85) return "A";
  if (totalScore >= 70) return "B";
  if (totalScore >= 55) return "C";
  return "D";
}

export function getRecommendation(totalScore: number): Recommendation {
  if (totalScore >= 85) return "RELATIVE_STRENGTH";
  if (totalScore >= 70) return "NEUTRAL";
  if (totalScore >= 55) return "WATCH";
  return "LAGGARD";
}

export function getRecommendationLabel(recommendation: Recommendation) {
  const labels: Record<Recommendation, string> = {
    RELATIVE_STRENGTH: "상대 우위",
    NEUTRAL: "중립",
    WATCH: "관찰",
    LAGGARD: "후순위",
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
  const momentumScores = normalizeValues(momentumRaw, "direct", {
    minScore: 20,
  });
  const stabilityScores = normalizeValues(
    etfs.map((etf) => etf.volatility),
    "inverse",
    { minScore: 20 }
  );
  const diversificationScores = normalizeValues(
    etfs.map((etf) => etf.diversificationScore),
    "direct",
    { minScore: 20 }
  );
  const productScores = normalizeValues(
    etfs.map((etf) => etf.liquidityScore),
    "direct",
    { minScore: 20 }
  );
  const costScores = normalizeValues(
    etfs.map((etf) => etf.expenseRatio),
    "inverse",
    { minScore: 20 }
  );

  const partialScores = etfs.map((etf, index) => {
    const rawTotalScore =
      momentumScores[index] * (weights.momentum / 100) +
      stabilityScores[index] * (weights.stability / 100) +
      diversificationScores[index] * (weights.diversification / 100) +
      productScores[index] * (weights.product / 100) +
      costScores[index] * (weights.cost / 100);

    return {
      ...etf,
      momentumRaw: momentumRaw[index],
      momentumScore: momentumScores[index],
      stabilityScore: stabilityScores[index],
      diversificationScore: diversificationScores[index],
      productScore: productScores[index],
      costScore: costScores[index],
      rawTotalScore,
    };
  });
  const calibratedTotalScores = normalizeValues(
    partialScores.map((score) => score.rawTotalScore),
    "direct"
  ).map((score) => 40 + score * 0.5);

  const scored = partialScores.map((partial, index) => {
    const roundedTotal = Math.round(calibratedTotalScores[index] * 10) / 10;

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
