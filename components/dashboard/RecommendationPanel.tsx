import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRoleLabel } from "@/lib/recommendation";
import type { PortfolioRecommendation } from "@/types/etf";

type RecommendationPanelProps = {
  recommendation: PortfolioRecommendation;
};

export function RecommendationPanel({
  recommendation,
}: RecommendationPanelProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>추천 포트폴리오</CardTitle>
        <CardDescription>{recommendation.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          이 비중은 입력 데이터와 산식으로 만든 참고용 결과입니다. 실제
          투자 판단은 투자 목적, 기간, 세금, 계좌 상황을 함께 고려해야 합니다.
        </p>
      </CardContent>
    </Card>
  );
}
