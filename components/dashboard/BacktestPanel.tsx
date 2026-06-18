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

export function BacktestPanel({
  strategy,
  symbols,
  returnBasis,
  displayCurrency,
}: BacktestPanelProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [frequency, setFrequency] = useState<RebalanceFrequency>("monthly");
  const [result, setResult] = useState<BacktestResult | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const config = useMemo<BacktestConfig>(
    () => ({
      symbols,
      strategy,
      startDate,
      endDate,
      rebalanceFrequency: frequency,
      returnBasis,
      initialCapital: returnBasis === "krwInvestor" ? 10_000_000 : 10_000,
      transactionCostBps: 5,
      slippageBps: 0,
    }),
    [endDate, frequency, returnBasis, startDate, strategy, symbols]
  );

  function run() {
    setError(undefined);
    startTransition(async () => {
      try {
        const response = await fetch("/api/backtest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? `Backtest failed with ${response.status}`);
        }

        setResult((await response.json()) as BacktestResult);
      } catch (backtestError) {
        setError(
          backtestError instanceof Error
            ? backtestError.message
            : "Backtest failed."
        );
      }
    });
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
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{result.provider}</Badge>
                <Badge variant="secondary">{result.config.rebalanceFrequency}</Badge>
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
              </div>

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
        </CardContent>
      </Card>
    </section>
  );
}
