import { describe, expect, it } from "vitest";

import { sampleEtfs } from "../../data/sample-etfs";
import { evaluateMarketRegime } from "../market-regime";
import { calculateEtfScores } from "../scoring";
import { strategyPresets } from "../strategy-presets";
import { buildTargetAllocations, DEFAULT_POLICY } from "./policy";
import { buildNewCashTradePlan, buildRebalanceTradePlan, estimateEtfPrice } from "./trade-plan";

const scores = calculateEtfScores(sampleEtfs, strategyPresets.balanced.weights);

describe("portfolio policy", () => {
  it("builds balanced target allocations for the current market regime", () => {
    const regime = evaluateMarketRegime(scores);
    const allocations = buildTargetAllocations({
      scores,
      marketRegime: regime.type,
      policy: DEFAULT_POLICY,
    });

    expect(allocations.length).toBeGreaterThan(0);
    expect(
      allocations.reduce((sum, allocation) => sum + allocation.targetWeightPct, 0)
    ).toBe(100);
  });

  it("blocks new cash buying in risk-off regimes", () => {
    const plan = buildNewCashTradePlan({
      amount: 10_000,
      marketRegime: "riskOff",
      policy: DEFAULT_POLICY,
      allocations: buildTargetAllocations({
        scores,
        marketRegime: "riskOff",
        policy: DEFAULT_POLICY,
      }),
      scores,
    });

    expect(plan.isNewCashBlocked).toBe(true);
    expect(plan.lines).toEqual([]);
  });

  it("uses the latest market price before fallback estimation", () => {
    const qqq = scores.find((score) => score.symbol === "QQQ");

    expect(qqq).toBeDefined();
    expect(estimateEtfPrice({ ...qqq!, latestPrice: 740.62 })).toBe(740.62);
  });

  it("generates rebalance lines only outside the drift threshold", () => {
    const allocations = buildTargetAllocations({
      scores,
      marketRegime: "riskOn",
      policy: DEFAULT_POLICY,
    });
    const plan = buildRebalanceTradePlan({
      positions: [{ symbol: "SPY", quantity: 1, avgPrice: 500, currency: "USD", updatedAt: "2026-06-19" }],
      policy: DEFAULT_POLICY,
      allocations,
      scores,
      marketRegime: "riskOn",
    });

    expect(plan.lines.length).toBeGreaterThan(0);
    expect(plan.lines.some((line) => Math.abs(line.driftPct) >= DEFAULT_POLICY.driftThresholdPct)).toBe(true);
  });
});
