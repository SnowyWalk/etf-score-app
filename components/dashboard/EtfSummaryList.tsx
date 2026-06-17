import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRecommendationLabel } from "@/lib/scoring";
import type { EtfScore } from "@/types/etf";

type EtfSummaryListProps = {
  scores: EtfScore[];
};

export function EtfSummaryList({ scores }: EtfSummaryListProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {scores.map((score) => (
        <Card key={score.symbol} size="sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{score.symbol}</CardTitle>
                <CardDescription>{score.name}</CardDescription>
              </div>
              <Badge variant="secondary">{getRecommendationLabel(score.recommendation)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Score</span>
              <span className="font-semibold tabular-nums">
                {score.totalScore.toFixed(1)} / 100
              </span>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {score.summary}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
