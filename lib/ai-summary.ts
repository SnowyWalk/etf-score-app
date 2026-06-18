import type { EtfScore, StrategyType } from "../types/etf";

type OpenAITextContent = {
  type?: string;
  text?: string;
};

type OpenAIMessageOutput = {
  type?: string;
  content?: OpenAITextContent[];
};

type OpenAIResponsePayload = {
  output_text?: string;
  output?: OpenAIMessageOutput[];
};

export type AiSummaryResult = {
  summaries: Record<string, string>;
  model: string;
  warnings: string[];
};

function compactScore(score: EtfScore) {
  return {
    symbol: score.symbol,
    name: score.name,
    totalScore: score.totalScore,
    grade: score.grade,
    recommendation: score.recommendation,
    category: score.category,
    role: score.role,
    returns: {
      oneMonth: score.return1M,
      threeMonths: score.return3M,
      sixMonths: score.return6M,
      twelveMonths: score.return12M,
      ytd: score.returnYTD,
    },
    scores: {
      momentum: Math.round(score.momentumScore * 10) / 10,
      stability: Math.round(score.stabilityScore * 10) / 10,
      diversification: Math.round(score.diversificationScore * 10) / 10,
      liquidity: Math.round(score.productScore * 10) / 10,
      cost: Math.round(score.costScore * 10) / 10,
    },
    volatility: score.volatility,
    expenseRatio: score.expenseRatio,
    ruleSummary: score.summary,
  };
}

export function buildSummaryPrompt(input: {
  strategy: StrategyType;
  scores: EtfScore[];
}) {
  return `ETF 평가 결과를 한국어로 요약해 주세요.

조건:
- 투자 자문처럼 단정하지 말고, 점수 기반 참고 정보로 표현하세요.
- 매수/매도 지시를 하지 마세요.
- 각 ETF마다 1문장, 90자 이내로 작성하세요.
- 모멘텀, 안정성, 분산, 비용 중 눈에 띄는 이유를 하나 이상 반영하세요.
- TLT는 현금성 자산이 아니라 장기채 금리 민감 자산임을 필요 시 반영하세요.
- GLD는 금 가격 노출이며 현금흐름이 없다는 점을 필요 시 반영하세요.
- JSON만 반환하세요. 형식: {"summaries":{"SPY":"...","QQQ":"..."}}

전략: ${input.strategy}
ETF 데이터:
${JSON.stringify(input.scores.map(compactScore), null, 2)}`;
}

export function extractOpenAIText(payload: OpenAIResponsePayload) {
  if (payload.output_text) {
    return payload.output_text;
  }

  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

export function parseSummaryJson(text: string) {
  const parsed = JSON.parse(text) as {
    summaries?: Record<string, unknown>;
  };
  const summaries = Object.fromEntries(
    Object.entries(parsed.summaries ?? {}).flatMap(([symbol, summary]) => {
      if (typeof summary !== "string" || summary.trim().length === 0) {
        return [];
      }

      return [[symbol.toUpperCase(), summary.trim()]];
    })
  );

  return summaries;
}
