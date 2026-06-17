import { describe, expect, it } from "vitest";

import { sampleEtfs } from "../data/sample-etfs";
import { buildPortfolioRecommendation } from "./recommendation";
import { calculateEtfScores } from "./scoring";
import { strategyPresets } from "./strategy-presets";

describe("buildPortfolioRecommendation", () => {
  it("builds balanced role-aware weights that sum to 100", () => {
    const scores = calculateEtfScores(
      sampleEtfs,
      strategyPresets.balanced.weights
    );
    const recommendation = buildPortfolioRecommendation(scores, "balanced");

    expect(recommendation.allocations.map((item) => item.symbol)).toEqual([
      "SPY",
      "GLD",
      "TLT",
    ]);
    expect(
      recommendation.allocations.reduce((sum, item) => sum + item.weight, 0)
    ).toBe(100);
    expect(recommendation.allocations.map((item) => item.weight)).toEqual([
      50,
      25,
      25,
    ]);
  });

  it("limits recommendations to available ETFs and normalizes weights", () => {
    const scores = calculateEtfScores(
      sampleEtfs.slice(0, 2),
      strategyPresets.aggressive.weights
    );
    const recommendation = buildPortfolioRecommendation(scores, "aggressive");

    expect(recommendation.allocations).toHaveLength(2);
    expect(
      recommendation.allocations.reduce((sum, item) => sum + item.weight, 0)
    ).toBe(100);
  });
});
