import type { EtfScore, MarketRegime } from "@/types/etf";

const RISK_ASSET_ROLES = new Set(["equityCore", "equityGrowth", "sectorSatellite"]);
const DEFENSIVE_ROLES = new Set(["goldHedge", "bondDefensive", "cashLike"]);

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function evaluateMarketRegime(scores: EtfScore[]): MarketRegime {
  const riskAssets = scores.filter((score) => RISK_ASSET_ROLES.has(score.role));
  const defensiveAssets = scores.filter((score) => DEFENSIVE_ROLES.has(score.role));
  const coreRisk = scores.filter((score) =>
    ["SPY", "VTI", "IVV", "QQQ", "379800.KS", "379810.KS"].includes(score.symbol)
  );
  const risk12M = average(riskAssets.map((score) => score.return12M));
  const risk3M = average(riskAssets.map((score) => score.return3M));
  const core12M = average(coreRisk.map((score) => score.return12M));
  const defensive12M = average(defensiveAssets.map((score) => score.return12M));
  const breadth =
    riskAssets.length > 0
      ? riskAssets.filter((score) => score.return12M > 0).length / riskAssets.length
      : 0;
  let score = 50;
  const reasons: string[] = [];

  if (core12M > 5) {
    score += 18;
    reasons.push(`핵심 주식 ETF 12개월 평균 수익률이 ${round(core12M)}%입니다.`);
  } else if (core12M < 0) {
    score -= 22;
    reasons.push(`핵심 주식 ETF 12개월 평균 수익률이 ${round(core12M)}%입니다.`);
  }

  if (risk3M > 2) {
    score += 12;
    reasons.push(`위험자산 3개월 평균 수익률이 ${round(risk3M)}%입니다.`);
  } else if (risk3M < -2) {
    score -= 14;
    reasons.push(`위험자산 3개월 평균 수익률이 ${round(risk3M)}%입니다.`);
  }

  if (breadth >= 0.65) {
    score += 10;
    reasons.push(`위험자산 중 ${round(breadth * 100, 0)}%가 12개월 양수입니다.`);
  } else if (breadth < 0.45) {
    score -= 12;
    reasons.push(`위험자산 중 ${round(breadth * 100, 0)}%만 12개월 양수입니다.`);
  }

  if (risk12M < defensive12M - 3) {
    score -= 14;
    reasons.push(
      `방어자산 12개월 평균이 위험자산보다 ${round(defensive12M - risk12M)}%p 높습니다.`
    );
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));

  if (boundedScore >= 70) {
    return {
      type: "riskOn",
      label: "Risk-On",
      actionLabel: "신규 편입 검토 가능",
      score: boundedScore,
      reasons,
    };
  }

  if (boundedScore >= 45) {
    return {
      type: "neutral",
      label: "Neutral",
      actionLabel: "분할 접근 / 관찰",
      score: boundedScore,
      reasons,
    };
  }

  return {
    type: "riskOff",
    label: "Risk-Off",
    actionLabel: "신규 편입 보류",
    score: boundedScore,
    reasons,
  };
}
