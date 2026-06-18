"use client";

import { useMemo, useState, useTransition } from "react";
import { BarChart3, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  BacktestConfig,
  BacktestResult,
  RebalanceFrequency,
  RebalanceMode,
} from "@/types/backtest";
import type { ReturnBasis, StrategyType } from "@/types/etf";

type BacktestPanelProps = {
  strategy: StrategyType;
  symbols: string[];
  returnBasis: ReturnBasis;
  displayCurrency: string;
};

function defaultStartDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "KRW" ? "KRW" : "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeHigher(value: number, values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }

  if (min === max) {
    return 50;
  }

  return ((value - min) / (max - min)) * 100;
}

function normalizeLower(value: number, values: number[]) {
  return 100 - normalizeHigher(value, values);
}

export function BacktestPanel({
  strategy,
  symbols,
  returnBasis,
  displayCurrency,
}: BacktestPanelProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<RebalanceFrequency>("monthly");
  const [mode, setMode] = useState<RebalanceMode>("scheduled");
  const [driftThresholdPct, setDriftThresholdPct] = useState(5);
  const [result, setResult] = useState<BacktestResult | undefined>();
  const [comparisonResults, setComparisonResults] = useState<BacktestResult[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const config = useMemo<BacktestConfig>(
    () => ({
      symbols,
      strategy,
      startDate,
      endDate,
      rebalanceFrequency: frequency,
      rebalanceMode: mode,
      driftThresholdPct,
      returnBasis,
      initialCapital: returnBasis === "krwInvestor" ? 10_000_000 : 10_000,
      transactionCostBps: 5,
      slippageBps: 0,
      benchmarkSymbol: "SPY",
    }),
    [
      driftThresholdPct,
      endDate,
      frequency,
      mode,
      returnBasis,
      startDate,
      strategy,
      symbols,
    ]
  );
  const rankedComparisonResults = useMemo(() => {
    if (comparisonResults.length === 0) {
      return [];
    }

    const cagrs = comparisonResults.map((item) => item.summary.cagr);
    const drawdowns = comparisonResults.map((item) =>
      Math.abs(item.summary.maxDrawdown)
    );
    const sharpes = comparisonResults.map((item) => item.summary.sharpeRatio);
    const excessCagrs = comparisonResults.map(
      (item) => item.benchmark?.excessCagr ?? 0
    );
    const turnovers = comparisonResults.map((item) => item.summary.turnover);

    return comparisonResults
      .map((item) => {
        const score =
          normalizeHigher(item.summary.cagr, cagrs) * 0.3 +
          normalizeLower(Math.abs(item.summary.maxDrawdown), drawdowns) * 0.25 +
          normalizeHigher(item.summary.sharpeRatio, sharpes) * 0.2 +
          normalizeHigher(item.benchmark?.excessCagr ?? 0, excessCagrs) * 0.15 +
          normalizeLower(item.summary.turnover, turnovers) * 0.1;

        return {
          result: item,
          score: Math.round(score * 10) / 10,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [comparisonResults]);

  async function requestBacktest(nextConfig: BacktestConfig) {
    const response = await fetch("/api/backtest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextConfig),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? `Backtest failed with ${response.status}`);
    }

    return (await response.json()) as BacktestResult;
  }

  function run() {
    setError(undefined);
    startTransition(async () => {
      try {
        setResult(await requestBacktest(config));
      } catch (backtestError) {
        setError(
          backtestError instanceof Error
            ? backtestError.message
            : "Backtest failed."
        );
      }
    });
  }

  function runComparison() {
    setError(undefined);
    startTransition(async () => {
      try {
        const variants: BacktestConfig[] = [
          { ...config, rebalanceFrequency: "monthly", rebalanceMode: "scheduled" },
          { ...config, rebalanceFrequency: "quarterly", rebalanceMode: "scheduled" },
          {
            ...config,
            rebalanceFrequency: "monthly",
            rebalanceMode: "threshold",
            driftThresholdPct,
          },
          {
            ...config,
            rebalanceFrequency: "quarterly",
            rebalanceMode: "threshold",
            driftThresholdPct,
          },
        ];

        setComparisonResults(await Promise.all(variants.map(requestBacktest)));
      } catch (backtestError) {
        setError(
          backtestError instanceof Error
            ? backtestError.message
            : "Backtest comparison failed."
        );
      }
    });
  }

  function configLabel(backtest: BacktestResult) {
    const frequencyLabel =
      backtest.config.rebalanceFrequency === "monthly" ? "월간" : "분기";
    const modeLabel =
      backtest.config.rebalanceMode === "scheduled"
        ? "고정"
        : `이탈 ${backtest.config.driftThresholdPct}%p`;

    return `${frequencyLabel} ${modeLabel}`;
  }

  function scoreComment(backtest: BacktestResult) {
    const parts: string[] = [];

    if (backtest.benchmark && backtest.benchmark.excessCagr > 0) {
      parts.push("벤치마크 초과");
    } else {
      parts.push("벤치마크 미달");
    }

    if (backtest.summary.maxDrawdown > -15) {
      parts.push("낙폭 양호");
    } else if (backtest.summary.maxDrawdown > -25) {
      parts.push("낙폭 보통");
    } else {
      parts.push("낙폭 큼");
    }

    if (backtest.summary.turnover < 1) {
      parts.push("회전율 낮음");
    } else if (backtest.summary.turnover < 3) {
      parts.push("회전율 보통");
    } else {
      parts.push("회전율 높음");
    }

    return parts.join(" · ");
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">백테스트</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          선택한 전략을 과거 일봉 데이터에 월간 또는 분기 리밸런싱으로 적용합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-4" />
            전략 성과 시뮬레이션
          </CardTitle>
          <CardDescription>
            무료 EOD API 기준의 가상 과거 성과이며 미래 수익을 보장하지 않습니다.
            현재 수익률 기준은{" "}
            {returnBasis === "krwInvestor" ? "KRW 투자자 기준" : "상장 통화 기준"}
            입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
            <label className="grid gap-1 text-sm">
              시작일
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-9 rounded-md border bg-background px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              종료일
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-9 rounded-md border bg-background px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              리밸런싱
              <select
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as RebalanceFrequency)
                }
                className="h-9 rounded-md border bg-background px-3"
              >
                <option value="monthly">월간</option>
                <option value="quarterly">분기</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              실행 기준
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as RebalanceMode)}
                className="h-9 rounded-md border bg-background px-3"
              >
                <option value="scheduled">정기 고정</option>
                <option value="threshold">이탈 시만</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              이탈 기준
              <input
                type="number"
                min={1}
                max={30}
                value={driftThresholdPct}
                onChange={(event) =>
                  setDriftThresholdPct(Number(event.target.value))
                }
                className="h-9 rounded-md border bg-background px-3"
              />
            </label>
            <div className="flex items-end">
              <Button type="button" onClick={run} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <BarChart3 className="size-4" />
                )}
                실행
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={runComparison}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BarChart3 className="size-4" />
              )}
              리밸런싱 기준 비교
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{result.provider}</Badge>
                <Badge variant="secondary">{result.config.rebalanceFrequency}</Badge>
                <Badge variant="secondary">{result.config.rebalanceMode}</Badge>
                <Badge variant="secondary">
                  {result.config.returnBasis === "krwInvestor"
                    ? "KRW basis"
                    : "Local basis"}
                </Badge>
                <Badge variant="secondary">
                  {result.rebalances.length} rebalances
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">CAGR</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatPercent(result.summary.cagr)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">MDD</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatPercent(result.summary.maxDrawdown)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">총수익률</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatPercent(result.summary.totalReturn)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">종료 금액</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatCurrency(result.summary.endValue, displayCurrency)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">변동성</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatPercent(result.summary.annualizedVolatility)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">Sharpe</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {result.summary.sharpeRatio.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">Calmar</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {result.summary.calmarRatio.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-muted-foreground">회전율</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {(result.summary.turnover * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              {result.benchmark ? (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">
                    벤치마크 {result.benchmark.symbol} 대비
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    전략 CAGR {formatPercent(result.summary.cagr)} · 벤치마크 CAGR{" "}
                    {formatPercent(result.benchmark.cagr)} · 초과 CAGR{" "}
                    {formatPercent(result.benchmark.excessCagr)}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">최근 리밸런싱</p>
                <div className="grid gap-2">
                  {result.rebalances.slice(-3).map((rebalance) => (
                    <div
                      key={rebalance.date}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="font-medium">{rebalance.date}</div>
                      <div className="mt-1 text-muted-foreground">
                        {rebalance.allocations
                          .map(
                            (allocation) =>
                              `${allocation.symbol} ${allocation.weight}%`
                          )
                          .join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {result.warnings.length > 0 ? (
                <div className="space-y-1">
                  {result.warnings.map((warning) => (
                    <p key={warning} className="text-sm text-amber-700">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {comparisonResults.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">리밸런싱 기준 비교</p>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-medium">백테스트 품질 순위</div>
                <p className="mt-1 text-muted-foreground">
                  백테스트 점수는 CAGR 30%, MDD 25%, Sharpe 20%, 벤치마크
                  초과 CAGR 15%, 회전율 10%를 같은 비교군 안에서 정규화한
                  참고 점수입니다. 과거 구간에 맞춘 순위이므로 그대로 매수
                  결론으로 쓰면 안 됩니다.
                </p>
                <div className="mt-3 grid gap-2">
                  {rankedComparisonResults.map((item, index) => (
                    <div
                      key={`rank-${item.result.config.rebalanceFrequency}-${item.result.config.rebalanceMode}`}
                      className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {index + 1}. {configLabel(item.result)}
                        </div>
                        <div className="text-muted-foreground">
                          {scoreComment(item.result)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">
                          {item.score.toFixed(1)}점
                        </div>
                        <div className="text-xs text-muted-foreground">
                          CAGR {formatPercent(item.result.summary.cagr)} · MDD{" "}
                          {formatPercent(item.result.summary.maxDrawdown)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">순위</th>
                      <th className="px-3 py-2 text-left font-medium">기준</th>
                      <th className="px-3 py-2 text-right font-medium">점수</th>
                      <th className="px-3 py-2 text-right font-medium">CAGR</th>
                      <th className="px-3 py-2 text-right font-medium">MDD</th>
                      <th className="px-3 py-2 text-right font-medium">Sharpe</th>
                      <th className="px-3 py-2 text-right font-medium">회전율</th>
                      <th className="px-3 py-2 text-right font-medium">횟수</th>
                      <th className="px-3 py-2 text-right font-medium">
                        초과 CAGR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedComparisonResults.map((rankedItem, index) => {
                      const item = rankedItem.result;

                      return (
                      <tr
                        key={`${item.config.rebalanceFrequency}-${item.config.rebalanceMode}`}
                        className="border-t"
                      >
                        <td className="px-3 py-2 text-right tabular-nums">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2">{configLabel(item)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {rankedItem.score.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPercent(item.summary.cagr)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPercent(item.summary.maxDrawdown)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.summary.sharpeRatio.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(item.summary.turnover * 100).toFixed(0)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.summary.rebalanceCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.benchmark
                            ? formatPercent(item.benchmark.excessCagr)
                            : "-"}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
