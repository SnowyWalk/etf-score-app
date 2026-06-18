"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Database, Gauge, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { EtfRawData, ReturnBasis, StrategyType } from "@/types/etf";
import type { EtfMarketSnapshot, MarketDataStatus } from "@/types/market";
import { BacktestPanel } from "./BacktestPanel";
import { EtfScoreTable } from "./EtfScoreTable";
import { EtfSummaryList } from "./EtfSummaryList";
import { RebalanceNotes } from "./RebalanceNotes";
import { RecommendationPanel } from "./RecommendationPanel";
import { StrategySelector } from "./StrategySelector";

const TOP_ETF_LIMIT = 10;

type EtfDashboardClientProps = {
  etfs?: EtfRawData[];
  initialSnapshot?: EtfMarketSnapshot;
};

export function EtfDashboardClient({
  etfs = sampleEtfs,
  initialSnapshot,
}: EtfDashboardClientProps) {
  const [strategy, setStrategy] = useState<StrategyType>("balanced");
  const [snapshot, setSnapshot] = useState<EtfMarketSnapshot | undefined>(
    initialSnapshot
  );
  const [returnBasis, setReturnBasis] = useState<ReturnBasis>(
    initialSnapshot?.returnBasis ?? "krwInvestor"
  );
  const [isPending, startTransition] = useTransition();
  const [refreshError, setRefreshError] = useState<string | undefined>();
  const preset = getStrategyPreset(strategy);
  const activeEtfs = snapshot?.etfs ?? etfs;
  const dataStatus =
    snapshot?.status ??
    ({
      provider: "sample",
      freshness: "sample",
      asOf: new Date().toISOString(),
      isFallback: true,
      warnings: ["Using local sample data."],
    } satisfies MarketDataStatus);

  const scores = useMemo(
    () => calculateEtfScores(activeEtfs, preset.weights),
    [activeEtfs, preset.weights]
  );
  const visibleScores = useMemo(
    () => scores.slice(0, TOP_ETF_LIMIT),
    [scores]
  );
  const recommendation = useMemo(
    () => buildPortfolioRecommendation(visibleScores, strategy),
    [visibleScores, strategy]
  );
  const topScore = visibleScores[0];
  const isSample = dataStatus.freshness === "sample" || dataStatus.isFallback;

  function returnBasisLabel(value: ReturnBasis) {
    return value === "krwInvestor" ? "KRW 투자자 기준" : "상장 통화 기준";
  }

  function refreshMarketData(nextReturnBasis = returnBasis) {
    setRefreshError(undefined);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          refresh: "true",
          returnBasis: nextReturnBasis,
        });
        const response = await fetch(`/api/market/etfs?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Refresh failed with ${response.status}`);
        }

        const nextSnapshot = (await response.json()) as EtfMarketSnapshot;

        setSnapshot(nextSnapshot);
        setReturnBasis(nextSnapshot.returnBasis);
      } catch (error) {
        setRefreshError(
          error instanceof Error ? error.message : "Refresh failed."
        );
      }
    });
  }

  function changeReturnBasis(nextReturnBasis: ReturnBasis) {
    setReturnBasis(nextReturnBasis);
    refreshMarketData(nextReturnBasis);
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Database className="size-3" />
                  {dataStatus.provider}
                </Badge>
                <Badge variant={isSample ? "secondary" : "default"}>
                  {dataStatus.freshness.toUpperCase()}
                </Badge>
                <Badge variant="outline">
                  {returnBasisLabel(snapshot?.returnBasis ?? returnBasis)}
                </Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                  ETF Score Dashboard
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  대표 ETF 후보군을 무료 EOD 데이터로 평가하고, 전략별 Top
                  10과 역할 기반 추천 비중을 계산합니다.
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
                수익을 보장하지 않습니다. 한국 상장 해외 ETF와 미국 ETF를
                함께 볼 때는 선택한 통화 기준과 환헤지 여부를 확인하세요.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">데이터 상태</p>
                <p className="text-sm text-muted-foreground">
                  {dataStatus.provider} · {dataStatus.freshness.toUpperCase()} ·{" "}
                  {new Date(dataStatus.asOf).toLocaleString("ko-KR")} ·{" "}
                  {returnBasisLabel(snapshot?.returnBasis ?? returnBasis)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {snapshot?.displayCurrency === "KRW"
                    ? "미국 상장 ETF는 USD/KRW EOD 환율로 원화 환산 후 계산합니다."
                    : "각 ETF의 상장 통화 가격을 그대로 사용합니다."}
                </p>
                {[...dataStatus.warnings, refreshError]
                  .filter(Boolean)
                  .map((warning) => (
                    <p key={warning} className="text-sm text-amber-700">
                      {warning}
                    </p>
                  ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => refreshMarketData()}
                disabled={isPending}
              >
                <RefreshCw className="size-4" />
                {isPending ? "갱신 중" : "데이터 갱신"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">수익률 비교 기준</p>
                <p className="text-sm text-muted-foreground">
                  한국 ETF와 미국 ETF를 섞을 때 점수, 추천, 백테스트에 동일하게
                  적용됩니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={returnBasis === "krwInvestor" ? "default" : "outline"}
                  onClick={() => changeReturnBasis("krwInvestor")}
                  disabled={isPending}
                >
                  KRW 투자자 기준
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={returnBasis === "localPrice" ? "default" : "outline"}
                  onClick={() => changeReturnBasis("localPrice")}
                  disabled={isPending}
                >
                  상장 통화 기준
                </Button>
              </div>
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
                <CardDescription>현재 데이터 소스 기준</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{scores.length}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSample
                    ? "샘플 fallback 기준"
                    : `후보 ${scores.length}개 중 Top ${visibleScores.length}`}
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
              확장 후보군을 총점 내림차순으로 정렬하고 Top 10만 표시합니다.
            </p>
          </div>
          <EtfScoreTable scores={visibleScores} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">ETF별 Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Top 10 ETF에 대해 규칙 기반 또는 AI 요약을 표시합니다.
            </p>
          </div>
          <EtfSummaryList scores={visibleScores} strategy={strategy} />
        </section>

        <BacktestPanel
          strategy={strategy}
          symbols={visibleScores.map((score) => score.symbol)}
          returnBasis={returnBasis}
          displayCurrency={snapshot?.displayCurrency ?? "KRW"}
        />

        <RebalanceNotes />
      </div>
    </main>
  );
}
