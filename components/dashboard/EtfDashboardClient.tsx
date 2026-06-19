"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileClock,
  Gauge,
  ListFilter,
  RefreshCw,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { sampleEtfs } from "@/data/sample-etfs";
import { evaluateMarketRegime } from "@/lib/market-regime";
import { DEFAULT_POLICY } from "@/lib/portfolio/policy";
import { buildTargetAllocations, filterPortfolioCandidates } from "@/lib/portfolio/policy";
import { buildNewCashTradePlan, buildRebalanceTradePlan } from "@/lib/portfolio/trade-plan";
import { PORTFOLIO_ROLE_LABELS, US_ETF_UNIVERSE } from "@/lib/portfolio/universe";
import { calculateEtfScores } from "@/lib/scoring";
import { strategyPresets } from "@/lib/strategy-presets";
import type { EtfRawData, ReturnBasis } from "@/types/etf";
import type { EtfMarketSnapshot, MarketDataStatus } from "@/types/market";
import type { PortfolioState, TradePlan } from "@/types/portfolio";

type EtfDashboardClientProps = {
  etfs?: EtfRawData[];
  initialSnapshot?: EtfMarketSnapshot;
};

type TradeForm = {
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
  fxRate: string;
  tradeDate: string;
};

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function EtfDashboardClient({
  etfs = sampleEtfs,
  initialSnapshot,
}: EtfDashboardClientProps) {
  const [snapshot, setSnapshot] = useState<EtfMarketSnapshot | undefined>(
    initialSnapshot
  );
  const [returnBasis, setReturnBasis] = useState<ReturnBasis>(
    initialSnapshot?.returnBasis ?? "localPrice"
  );
  const [portfolio, setPortfolio] = useState<PortfolioState>({
    policy: DEFAULT_POLICY,
    positions: [],
    manualTrades: [],
  });
  const [investmentAmount, setInvestmentAmount] = useState("10000");
  const [tradeForm, setTradeForm] = useState<TradeForm>({
    symbol: "SPY",
    side: "buy",
    quantity: "",
    price: "",
    fee: "0",
    fxRate: "1",
    tradeDate: today(),
  });
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [refreshError, setRefreshError] = useState<string>();

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
    () =>
      calculateEtfScores(
        activeEtfs.filter((etf) => US_ETF_UNIVERSE.includes(etf.symbol as never)),
        strategyPresets.balanced.weights
      ),
    [activeEtfs]
  );
  const marketRegime = useMemo(() => evaluateMarketRegime(scores), [scores]);
  const candidates = useMemo(
    () => filterPortfolioCandidates(scores, portfolio.policy),
    [scores, portfolio.policy]
  );
  const allocations = useMemo(
    () =>
      buildTargetAllocations({
        scores,
        marketRegime: marketRegime.type,
        policy: portfolio.policy,
      }),
    [scores, marketRegime.type, portfolio.policy]
  );
  const newCashPlan = useMemo(
    () =>
      buildNewCashTradePlan({
        amount: Number(investmentAmount) || 0,
        marketRegime: marketRegime.type,
        policy: portfolio.policy,
        allocations,
        scores,
      }),
    [allocations, investmentAmount, marketRegime.type, portfolio.policy, scores]
  );
  const rebalancePlan = useMemo(
    () =>
      buildRebalanceTradePlan({
        positions: portfolio.positions,
        policy: portfolio.policy,
        allocations,
        scores,
        marketRegime: marketRegime.type,
      }),
    [allocations, marketRegime.type, portfolio.policy, portfolio.positions, scores]
  );
  const isSample = dataStatus.freshness === "sample" || dataStatus.isFallback;

  useEffect(() => {
    loadPortfolio();
  }, []);

  async function loadPortfolio() {
    const response = await fetch("/api/portfolio", { cache: "no-store" });

    if (response.ok) {
      setPortfolio((await response.json()) as PortfolioState);
    }
  }

  function refreshMarketData(nextReturnBasis = returnBasis) {
    setRefreshError(undefined);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({
          refresh: "true",
          returnBasis: nextReturnBasis,
          symbols: US_ETF_UNIVERSE.join(","),
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

  async function recordTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    const response = await fetch("/api/portfolio/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeForm),
    });

    if (!response.ok) {
      setMessage("체결 입력을 저장하지 못했습니다. 수량과 가격을 확인하세요.");
      return;
    }

    setTradeForm((current) => ({
      ...current,
      quantity: "",
      price: "",
      fee: "0",
      tradeDate: today(),
    }));
    await loadPortfolio();
    setMessage("수동 체결과 보유 현황을 SQLite에 저장했습니다.");
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/portfolio", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rebalanceFrequency: form.get("rebalanceFrequency"),
        driftThresholdPct: form.get("driftThresholdPct"),
        minLiquidityScore: form.get("minLiquidityScore"),
        maxSingleEtfWeight: form.get("maxSingleEtfWeight"),
        cashBufferPct: form.get("cashBufferPct"),
      }),
    });

    if (response.ok) {
      await loadPortfolio();
      setMessage("정책 설정을 저장했습니다.");
    }
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
                <Badge variant="outline">SQLite manual mode</Badge>
                <Badge variant="outline">Toss orders disabled</Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                  ETF Portfolio Operator
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  미국 ETF 후보를 선별하고 목표 비중, 직접 매수 계획, 수동 체결
                  기록, 리밸런싱 주문안을 한 흐름으로 관리합니다.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = returnBasis === "localPrice" ? "krwInvestor" : "localPrice";
                  setReturnBasis(next);
                  refreshMarketData(next);
                }}
                disabled={isPending}
              >
                {returnBasis === "localPrice" ? "USD 기준" : "KRW 기준"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={() => refreshMarketData()}
                disabled={isPending}
              >
                <RefreshCw className="size-4" />
                {isPending ? "갱신 중" : "데이터 갱신"}
              </Button>
            </div>
          </div>

          <Card className="border-amber-200 bg-amber-50/70 text-amber-950">
            <CardContent className="flex gap-3 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm leading-6">
                이 앱은 개인 운용 보조 도구이며 투자 자문이 아닙니다. v1은
                수동 실행 모드만 제공하고, Toss API 주문은 명시 승인과
                안전장치가 붙기 전까지 실행하지 않습니다.
              </p>
            </CardContent>
          </Card>

          {[...dataStatus.warnings, refreshError, message]
            .filter(Boolean)
            .map((item) => (
              <p key={item} className="text-sm text-muted-foreground">
                {item}
              </p>
            ))}
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatusCard
            icon={<Gauge className="size-4" />}
            title="Market Regime"
            value={marketRegime.label}
            detail={`${marketRegime.score}/100 · ${marketRegime.actionLabel}`}
          />
          <StatusCard
            icon={<ListFilter className="size-4" />}
            title="Candidates"
            value={`${candidates.length}`}
            detail={`Liquidity score >= ${portfolio.policy.minLiquidityScore}`}
          />
          <StatusCard
            icon={<WalletCards className="size-4" />}
            title="Positions"
            value={`${portfolio.positions.length}`}
            detail={`${portfolio.manualTrades.length} manual fills stored`}
          />
          <StatusCard
            icon={<ShieldCheck className="size-4" />}
            title="Order Safety"
            value="Dry-run"
            detail="No Toss order execution in v1"
          />
        </section>

        <Tabs defaultValue="explore" className="gap-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="explore">Explore</TabsTrigger>
            <TabsTrigger value="plan">Portfolio Plan</TabsTrigger>
            <TabsTrigger value="execution">Execution</TabsTrigger>
            <TabsTrigger value="rebalance">Rebalance</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="explore">
            <ExploreTab scores={scores} candidates={candidates} />
          </TabsContent>

          <TabsContent value="plan">
            <PlanTab
              investmentAmount={investmentAmount}
              setInvestmentAmount={setInvestmentAmount}
              allocations={allocations}
              plan={newCashPlan}
              onUseLine={(line) =>
                setTradeForm((current) => ({
                  ...current,
                  symbol: line.symbol,
                  side: line.side,
                  quantity: String(line.suggestedQuantity || ""),
                  price: String(line.estimatedPrice || ""),
                }))
              }
            />
          </TabsContent>

          <TabsContent value="execution">
            <ExecutionTab
              form={tradeForm}
              setForm={setTradeForm}
              onSubmit={recordTrade}
              positions={portfolio.positions}
              trades={portfolio.manualTrades}
            />
          </TabsContent>

          <TabsContent value="rebalance">
            <RebalanceTab plan={rebalancePlan} positions={portfolio.positions} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab
              state={portfolio}
              onSubmit={savePolicy}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function StatusCard(props: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {props.icon}
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{props.value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{props.detail}</p>
      </CardContent>
    </Card>
  );
}

function ExploreTab({
  scores,
  candidates,
}: {
  scores: ReturnType<typeof calculateEtfScores>;
  candidates: ReturnType<typeof filterPortfolioCandidates>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>US ETF Universe</CardTitle>
        <CardDescription>
          데이터 품질과 유동성 기준을 통과한 ETF만 목표 포트폴리오 후보가 됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Liquidity</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scores.map((score) => {
              const eligible = candidates.some((item) => item.symbol === score.symbol);

              return (
                <TableRow key={score.symbol}>
                  <TableCell className="font-medium">{score.symbol}</TableCell>
                  <TableCell>{PORTFOLIO_ROLE_LABELS[score.role]}</TableCell>
                  <TableCell className="text-right">
                    {score.totalScore.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right">
                    {score.liquidityScore.toFixed(0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={eligible ? "default" : "secondary"}>
                      {eligible ? "Candidate" : "Filtered"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlanTab({
  investmentAmount,
  setInvestmentAmount,
  allocations,
  plan,
  onUseLine,
}: {
  investmentAmount: string;
  setInvestmentAmount: (value: string) => void;
  allocations: ReturnType<typeof buildTargetAllocations>;
  plan: TradePlan;
  onUseLine: (line: TradePlan["lines"][number]) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Target Portfolio</CardTitle>
          <CardDescription>Balanced core-satellite policy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-2 text-sm">
            투자 예정 금액
            <input
              className={inputClass}
              inputMode="decimal"
              value={investmentAmount}
              onChange={(event) => setInvestmentAmount(event.target.value)}
            />
          </label>
          <Separator />
          <div className="space-y-2">
            {allocations.map((allocation) => (
              <div
                key={allocation.symbol}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{allocation.symbol}</div>
                  <div className="text-muted-foreground">
                    {PORTFOLIO_ROLE_LABELS[allocation.role]}
                  </div>
                </div>
                <div className="text-lg font-semibold">
                  {pct(allocation.targetWeightPct)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Buy Plan</CardTitle>
          <CardDescription>{plan.message}</CardDescription>
        </CardHeader>
        <CardContent>
          {plan.isNewCashBlocked ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Risk-Off에서는 신규 매수 계획을 보류합니다. Explore에서 상대 점수는
              볼 수 있지만 매수 수량은 제안하지 않습니다.
            </div>
          ) : (
            <TradePlanTable plan={plan} actionLabel="체결 입력에 사용" onUseLine={onUseLine} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutionTab({
  form,
  setForm,
  onSubmit,
  positions,
  trades,
}: {
  form: TradeForm;
  setForm: (updater: (current: TradeForm) => TradeForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  positions: PortfolioState["positions"];
  trades: PortfolioState["manualTrades"];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Manual Fill Entry</CardTitle>
          <CardDescription>토스 앱에서 직접 체결한 실제 수량과 가격을 저장합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm">
              Symbol
              <input
                className={inputClass}
                value={form.symbol}
                onChange={(event) =>
                  setForm((current) => ({ ...current, symbol: event.target.value }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-2 text-sm">
                Side
                <Select
                  value={form.side}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      side: value as TradeForm["side"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm">
                Trade date
                <input
                  type="date"
                  className={inputClass}
                  value={form.tradeDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      tradeDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Quantity" value={form.quantity} field="quantity" setForm={setForm} />
              <NumberField label="Price" value={form.price} field="price" setForm={setForm} />
              <NumberField label="Fee" value={form.fee} field="fee" setForm={setForm} />
              <NumberField label="FX rate" value={form.fxRate} field="fxRate" setForm={setForm} />
            </div>
            <Button type="submit" className="gap-2">
              <CheckCircle2 className="size-4" />
              체결 저장
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <PositionsCard positions={positions} />
        <TradeHistoryCard trades={trades} />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  field,
  setForm,
}: {
  label: string;
  value: string;
  field: keyof TradeForm;
  setForm: (updater: (current: TradeForm) => TradeForm) => void;
}) {
  return (
    <label className="grid gap-2 text-sm">
      {label}
      <input
        className={inputClass}
        inputMode="decimal"
        value={value}
        onChange={(event) =>
          setForm((current) => ({ ...current, [field]: event.target.value }))
        }
      />
    </label>
  );
}

function PositionsCard({ positions }: { positions: PortfolioState["positions"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stored Positions</CardTitle>
        <CardDescription>리밸런싱은 이 보유 현황을 기준으로 계산합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Price</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.symbol}>
                <TableCell className="font-medium">{position.symbol}</TableCell>
                <TableCell className="text-right">{position.quantity.toFixed(4)}</TableCell>
                <TableCell className="text-right">{money(position.avgPrice, position.currency)}</TableCell>
                <TableCell>{new Date(position.updatedAt).toLocaleDateString("ko-KR")}</TableCell>
              </TableRow>
            ))}
            {positions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  저장된 보유 ETF가 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TradeHistoryCard({ trades }: { trades: PortfolioState["manualTrades"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Trade History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.slice(0, 8).map((trade) => (
              <TableRow key={trade.id}>
                <TableCell>{trade.tradeDate}</TableCell>
                <TableCell>{trade.side.toUpperCase()}</TableCell>
                <TableCell className="font-medium">{trade.symbol}</TableCell>
                <TableCell className="text-right">{trade.quantity.toFixed(4)}</TableCell>
                <TableCell className="text-right">{money(trade.price, trade.currency)}</TableCell>
              </TableRow>
            ))}
            {trades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  체결 이력이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RebalanceTab({
  plan,
  positions,
}: {
  plan: TradePlan;
  positions: PortfolioState["positions"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rebalance Draft</CardTitle>
        <CardDescription>
          현재 보유 평가액 {money(plan.totalPortfolioValue)} 기준 · drift threshold{" "}
          {pct(plan.driftThresholdPct)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {positions.length === 0 ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            먼저 Execution 탭에서 실제 체결을 입력하면 리밸런싱 주문안이 생성됩니다.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{plan.message}</p>
            <TradePlanTable plan={plan} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TradePlanTable({
  plan,
  actionLabel,
  onUseLine,
}: {
  plan: TradePlan;
  actionLabel?: string;
  onUseLine?: (line: TradePlan["lines"][number]) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Target %</TableHead>
          <TableHead className="text-right">Target Amount</TableHead>
          <TableHead className="text-right">Est. Price</TableHead>
          <TableHead className="text-right">Suggested Qty</TableHead>
          <TableHead className="text-right">Est. Amount</TableHead>
          {onUseLine ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {plan.lines.map((line) => (
          <TableRow key={`${line.symbol}-${line.side}`}>
            <TableCell className="font-medium">{line.symbol}</TableCell>
            <TableCell>
              <Badge variant={line.side === "buy" ? "default" : "secondary"}>
                {line.side.toUpperCase()}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{pct(line.targetWeightPct)}</TableCell>
            <TableCell className="text-right">{money(line.targetAmount)}</TableCell>
            <TableCell className="text-right">{money(line.estimatedPrice)}</TableCell>
            <TableCell className="text-right">{line.suggestedQuantity.toFixed(4)}</TableCell>
            <TableCell className="text-right">{money(line.estimatedAmount)}</TableCell>
            {onUseLine ? (
              <TableCell className="text-right">
                <Button type="button" size="sm" variant="outline" onClick={() => onUseLine(line)}>
                  {actionLabel}
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
        {plan.lines.length === 0 ? (
          <TableRow>
            <TableCell colSpan={onUseLine ? 8 : 7} className="text-muted-foreground">
              제안할 주문이 없습니다.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function SettingsTab({
  state,
  onSubmit,
}: {
  state: PortfolioState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-4" />
            Policy Settings
          </CardTitle>
          <CardDescription>저장 후 다음 매수 계획과 리밸런싱에 바로 반영됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
            <label className="grid gap-2 text-sm">
              Rebalance frequency
              <Select name="rebalanceFrequency" defaultValue={state.policy.rebalanceFrequency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <PolicyNumber name="driftThresholdPct" label="Drift threshold %" value={state.policy.driftThresholdPct} />
            <PolicyNumber name="minLiquidityScore" label="Min liquidity score" value={state.policy.minLiquidityScore} />
            <PolicyNumber name="maxSingleEtfWeight" label="Max single ETF %" value={state.policy.maxSingleEtfWeight} />
            <PolicyNumber name="cashBufferPct" label="Cash buffer %" value={state.policy.cashBufferPct} />
            <div className="sm:col-span-2">
              <Button type="submit">설정 저장</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="size-4" />
            Toss API Adapter
          </CardTitle>
          <CardDescription>v2 execution boundary</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>현재 모드: Toss 미연동, 수동 실행.</p>
          <p>주문 API는 기본 비활성이고 dry-run, 1회/전체 금액 상한, 사용자 승인 없이는 실행되지 않습니다.</p>
          <p>현재 read-only Toss 계좌 API는 유지하며, 주문 생성은 adapter 뒤에 추가될 수 있습니다.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PolicyNumber({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <label className="grid gap-2 text-sm">
      {label}
      <input name={name} className={inputClass} defaultValue={value} inputMode="decimal" />
    </label>
  );
}
