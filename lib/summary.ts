import type { EtfScore } from "../types/etf";

export function generateSummary(score: Omit<EtfScore, "summary">): string {
  if (score.symbol === "TLT") {
    return "장기채 노출을 통해 경기 둔화나 금리 하락 국면의 분산 역할을 기대할 수 있지만, 현금성 자산은 아닙니다.";
  }

  if (score.symbol === "GLD") {
    return "금 가격 노출을 제공하는 헤지 후보입니다. 현금흐름이나 이자를 만드는 자산은 아니므로 비중 제한이 필요합니다.";
  }

  if (score.totalScore >= 80) {
    return "현재 입력값 기준으로 모멘텀과 상품성이 모두 양호한 핵심 편입 후보입니다.";
  }

  if (score.momentumScore >= 70 && score.stabilityScore < 45) {
    return "모멘텀은 강하지만 변동성이 높아 단독 비중을 크게 두기보다 제한적으로 검토하는 편이 적절합니다.";
  }

  if (score.stabilityScore >= 70 && score.momentumScore < 50) {
    return "안정성은 상대적으로 높지만 수익 추세가 약해 방어용 또는 보조 비중에 적합합니다.";
  }

  if (score.totalScore >= 65) {
    return "여러 항목이 무난한 수준으로, 전략 목표와 기존 보유 비중에 따라 보유 후보로 검토할 수 있습니다.";
  }

  if (score.totalScore >= 50) {
    return "현재 기준에서는 적극 편입보다 관찰 대상으로 두고 추세 개선 여부를 확인하는 편이 적절합니다.";
  }

  return "현재 입력값 기준 점수가 낮아 신규 편입보다는 보류 대상으로 보는 편이 적절합니다.";
}
