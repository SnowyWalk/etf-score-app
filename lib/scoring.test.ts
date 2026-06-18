import { describe, expect, it } from "vitest";

import {
  calculateEtfScores,
  getGrade,
  getRecommendation,
  normalizeValues,
} from "./scoring";
import { strategyPresets } from "./strategy-presets";
import type { EtfRawData } from "../types/etf";

const baseEtf: EtfRawData = {
  symbol: "AAA",
  name: "AAA Fund",
  market: "US",
  listingCurrency: "USD",
  baseExposureCurrency: "USD",
  currencyHedge: "unhedged",
  returnBasis: "localPrice",
  returnCurrency: "USD",
  category: "equity",
  role: "equityCore",
  return1M: 1,
  return3M: 2,
  return6M: 3,
  return12M: 4,
  returnYTD: 3,
  volatility: 10,
  expenseRatio: 0.1,
  liquidityScore: 80,
  diversificationScore: 70,
  dataQuality: { status: "ok", reasons: [] },
};

describe("normalizeValues", () => {
  it("normalizes direct and inverse metrics", () => {
    expect(normalizeValues([10, 20, 30], "direct")).toEqual([0, 50, 100]);
    expect(normalizeValues([10, 20, 30], "inverse")).toEqual([100, 50, 0]);
  });

  it("returns 50 when all raw values are equal", () => {
    expect(normalizeValues([7, 7, 7], "direct")).toEqual([50, 50, 50]);
  });

  it("supports a non-zero floor for display-friendly factor scores", () => {
    expect(normalizeValues([10, 20, 30], "direct", { minScore: 20 })).toEqual([
      20,
      60,
      100,
    ]);
    expect(normalizeValues([10, 20, 30], "inverse", { minScore: 20 })).toEqual([
      100,
      60,
      20,
    ]);
  });
});

describe("grade and recommendation thresholds", () => {
  it("uses deterministic grade boundaries", () => {
    expect(getGrade(85)).toBe("A");
    expect(getGrade(84.9)).toBe("B");
    expect(getGrade(70)).toBe("B");
    expect(getGrade(69.9)).toBe("C");
    expect(getGrade(55)).toBe("C");
    expect(getGrade(54.9)).toBe("D");
  });

  it("uses deterministic recommendation boundaries", () => {
    expect(getRecommendation(85)).toBe("RELATIVE_STRENGTH");
    expect(getRecommendation(70)).toBe("NEUTRAL");
    expect(getRecommendation(55)).toBe("WATCH");
    expect(getRecommendation(54.9)).toBe("LAGGARD");
  });
});

describe("calculateEtfScores", () => {
  it("returns an empty array for empty input", () => {
    expect(calculateEtfScores([], strategyPresets.balanced.weights)).toEqual([]);
  });

  it("sorts tied total scores by symbol ascending", () => {
    const scores = calculateEtfScores(
      [
        { ...baseEtf, symbol: "BBB", name: "BBB Fund" },
        { ...baseEtf, symbol: "AAA", name: "AAA Fund" },
      ],
      strategyPresets.balanced.weights
    );

    expect(scores.map((score) => score.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("changes ordering when strategy weights change", () => {
    const stable: EtfRawData = {
      ...baseEtf,
      symbol: "STB",
      name: "Stable Fund",
      return12M: 3,
      volatility: 8,
      expenseRatio: 0.1,
    };
    const momentum: EtfRawData = {
      ...baseEtf,
      symbol: "MOM",
      name: "Momentum Fund",
      return12M: 20,
      volatility: 30,
      expenseRatio: 0.1,
    };

    const aggressive = calculateEtfScores(
      [stable, momentum],
      strategyPresets.aggressive.weights
    );
    const defensive = calculateEtfScores(
      [stable, momentum],
      strategyPresets.defensive.weights
    );

    expect(aggressive[0].symbol).toBe("MOM");
    expect(defensive[0].symbol).toBe("STB");
  });
});
