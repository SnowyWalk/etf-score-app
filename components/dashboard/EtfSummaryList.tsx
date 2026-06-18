"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRecommendationLabel } from "@/lib/scoring";
import type { EtfScore, StrategyType } from "@/types/etf";

type EtfSummaryListProps = {
  scores: EtfScore[];
  strategy: StrategyType;
};

type AiSummaryResponse = {
  summaries?: Record<string, string>;
  model?: string;
  warnings?: string[];
  error?: string;
};

export function EtfSummaryList({ scores, strategy }: EtfSummaryListProps) {
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [model, setModel] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const hasAiSummaries = Object.keys(aiSummaries).length > 0;

  function generateAiSummaries() {
    setError(undefined);
    setWarnings([]);

    startTransition(async () => {
      try {
        const response = await fetch("/api/ai/summaries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ strategy, scores }),
        });
        const payload = (await response.json()) as AiSummaryResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? `AI summary failed: ${response.status}`);
        }

        setAiSummaries(payload.summaries ?? {});
        setModel(payload.model);
        setWarnings(payload.warnings ?? []);
      } catch (summaryError) {
        setError(
          summaryError instanceof Error
            ? summaryError.message
            : "AI summary generation failed."
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasAiSummaries ? "default" : "secondary"}>
              {hasAiSummaries ? "AI Summary" : "Rule Summary"}
            </Badge>
            {model ? <Badge variant="outline">{model}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            OpenAI API key가 설정되어 있으면 현재 점수표를 바탕으로 ETF별
            요약을 다시 생성합니다.
          </p>
          {[...warnings, error].filter(Boolean).map((message) => (
            <p key={message} className="text-sm text-amber-700">
              {message}
            </p>
          ))}
        </div>
        <div className="flex gap-2">
          {hasAiSummaries ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setAiSummaries({});
                setModel(undefined);
                setWarnings([]);
                setError(undefined);
              }}
            >
              <RotateCcw className="size-4" />
              규칙 요약
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="gap-2"
            onClick={generateAiSummaries}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Bot className="size-4" />
            )}
            AI 요약
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {scores.map((score) => (
          <Card key={score.symbol} size="sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{score.symbol}</CardTitle>
                  <CardDescription>{score.name}</CardDescription>
                </div>
                <Badge variant="secondary">
                  {getRecommendationLabel(score.recommendation)}
                </Badge>
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
                {aiSummaries[score.symbol] ?? score.summary}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
