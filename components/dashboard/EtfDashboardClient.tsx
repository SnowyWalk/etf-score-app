"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Database, Gauge } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { sampleEtfs } from "@/data/sample-etfs";
import { buildPortfolioRecommendation } from "@/lib/recommendation";
import { calculateEtfScores } from "@/lib/scoring";
import { getStrategyPreset } from "@/lib/strategy-presets";
import type { EtfRawData, StrategyType } from "@/types/etf";
import { EtfScoreTable } from "./EtfScoreTable";
import { EtfSummaryList } from "./EtfSummaryList";
import { RebalanceNotes } from "./RebalanceNotes";
import { RecommendationPanel } from "./RecommendationPanel";
import { StrategySelector } from "./StrategySelector";

type EtfDashboardClientProps = {
  etfs?: EtfRawData[];
};

export function EtfDashboardClient({
  etfs = sampleEtfs,
}: EtfDashboardClientProps) {
  const [strategy, setStrategy] = useState<StrategyType>("balanced");
  const preset = getStrategyPreset(strategy);

  const scores = useMemo(
    () => calculateEtfScores(etfs, preset.weights),
    [etfs, preset.weights]
  );
  const recommendation = useMemo(
    () => buildPortfolioRecommendation(scores, strategy),
    [scores, strategy]
  );
  const topScore = scores[0];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Database className="size-3" />
                  Fixed sample data
                </Badge>
                <Badge variant="secondary">MVP</Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                  ETF Score Dashboard
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  QQQ, SPY, XLF, XLV, GLD, TLT를 전략별 가중치로 평가하고
                  역할 기반 추천 비중을 계산합니다.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">전략 선택</p>
              <StrategySelector value={strategy} onChange={setStrategy} />
            </div>
          </div>

          <Card className="border-amber-200 bg-amber-50/70 text-amber-950">
            <CardContent className="flex gap-3 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm leading-6">
                이 앱은 투자 판단 보조 도구이며 투자 자문이 아닙니다. 점수는
                입력 데이터와 산식에 따라 달라지고, ETF의 과거 성과가 미래
                수익을 보장하지 않습니다. 현재 화면은 고정 로컬 샘플 데이터만
                사용합니다.
              </p>
            </CardContent>
          </Card>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="size-4" />
                  현재 전략
                </CardTitle>
                <CardDescription>{preset.shortLabel}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">
                  {preset.description}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>최상위 ETF</CardTitle>
                <CardDescription>총점 기준 정렬</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{topScore?.symbol}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {topScore?.totalScore.toFixed(1)}점, Grade {topScore?.grade}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>평가 대상</CardTitle>
                <CardDescription>고정 샘플 ETF</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{scores.length}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  API 미연동, 로컬 데이터 기준
                </p>
              </CardContent>
            </Card>
            <Card className="sm:col-span-3">
              <CardHeader>
                <CardTitle>전략 가중치</CardTitle>
                <CardDescription>총점 100점 환산 기준</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-5">
                  {Object.entries(preset.weights).map(([key, value]) => (
                    <div key={key} className="rounded-lg border bg-background p-3">
                      <div className="text-sm capitalize text-muted-foreground">
                        {key}
                      </div>
                      <div className="mt-1 text-xl font-semibold">{value}%</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <RecommendationPanel recommendation={recommendation} />
        </section>

        <Separator />

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">점수 테이블</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              총점 내림차순, 동점은 Symbol 오름차순으로 정렬됩니다.
            </p>
          </div>
          <EtfScoreTable scores={scores} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">ETF별 Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              AI 요약이 아닌 규칙 기반 문장입니다.
            </p>
          </div>
          <EtfSummaryList scores={scores} />
        </section>

        <RebalanceNotes />
      </div>
    </main>
  );
}
