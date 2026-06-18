import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRoleLabel } from "@/lib/recommendation";
import type { MarketRegime, PortfolioRecommendation } from "@/types/etf";

type RecommendationPanelProps = {
  recommendation: PortfolioRecommendation;
  marketRegime: MarketRegime;
};

export function RecommendationPanel({
  recommendation,
  marketRegime,
}: RecommendationPanelProps) {
  const regimeVariant =
    marketRegime.type === "riskOn"
      ? "default"
      : marketRegime.type === "neutral"
        ? "secondary"
        : "destructive";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>상대 우위 포트폴리오</CardTitle>
        <CardDescription>
          {recommendation.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">시장 국면 필터</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {marketRegime.actionLabel}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={regimeVariant}>{marketRegime.label}</Badge>
              <span className="text-sm tabular-nums text-muted-foreground">
                {marketRegime.score}/100
              </span>
            </div>
          </div>
          {marketRegime.reasons.length > 0 ? (
            <div className="mt-2 space-y-1">
              {marketRegime.reasons.slice(0, 3).map((reason) => (
                <p key={reason} className="text-xs leading-5 text-muted-foreground">
                  {reason}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-3">
          {recommendation.allocations.map((allocation) => (
            <div
              key={allocation.symbol}
              className="rounded-lg border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {allocation.symbol}
                    </span>
                    <Badge variant="outline">{getRoleLabel(allocation.role)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {allocation.name}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {allocation.weight}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    score {allocation.totalScore.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          이 비중은 후보군 안의 상대 우위 조합입니다. 시장 국면이 Risk-Off이면
          점수가 높아도 신규 편입 신호로 해석하지 않고 보류 기준으로 봅니다.
        </p>
      </CardContent>
    </Card>
  );
}
