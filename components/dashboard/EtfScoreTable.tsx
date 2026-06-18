import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRecommendationLabel } from "@/lib/scoring";
import type { EtfScore, Grade, Recommendation } from "@/types/etf";

type EtfScoreTableProps = {
  scores: EtfScore[];
};

const gradeVariants: Record<Grade, "default" | "secondary" | "outline"> = {
  A: "default",
  B: "secondary",
  C: "outline",
  D: "outline",
};

const recommendationVariants: Record<
  Recommendation,
  "default" | "secondary" | "outline" | "destructive"
> = {
  BUY: "default",
  HOLD: "secondary",
  WATCH: "outline",
  AVOID: "destructive",
};

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="min-w-24 space-y-1">
      <div className="text-right tabular-nums">{value.toFixed(1)}</div>
      <Progress value={value} />
    </div>
  );
}

export function EtfScoreTable({ scores }: EtfScoreTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Symbol</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Momentum</TableHead>
            <TableHead className="text-right">Stability</TableHead>
            <TableHead className="text-right">Diversification</TableHead>
            <TableHead className="text-right">Product</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Recommendation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scores.map((score) => (
            <TableRow key={score.symbol}>
              <TableCell className="font-semibold">{score.symbol}</TableCell>
              <TableCell className="min-w-56 text-muted-foreground">
                {score.name}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{score.market}</Badge>
              </TableCell>
              <TableCell className="min-w-32 text-sm text-muted-foreground">
                {score.listingCurrency}
                {score.baseExposureCurrency !== score.listingCurrency
                  ? ` / ${score.baseExposureCurrency}`
                  : ""}
                <div className="text-xs capitalize">{score.currencyHedge}</div>
              </TableCell>
              <TableCell>
                <ScoreCell value={score.momentumScore} />
              </TableCell>
              <TableCell>
                <ScoreCell value={score.stabilityScore} />
              </TableCell>
              <TableCell>
                <ScoreCell value={score.diversificationScore} />
              </TableCell>
              <TableCell>
                <ScoreCell value={score.productScore} />
              </TableCell>
              <TableCell>
                <ScoreCell value={score.costScore} />
              </TableCell>
              <TableCell className="text-right text-base font-semibold tabular-nums">
                {score.totalScore.toFixed(1)}
              </TableCell>
              <TableCell>
                <Badge variant={gradeVariants[score.grade]}>{score.grade}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={recommendationVariants[score.recommendation]}>
                  {getRecommendationLabel(score.recommendation)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
