import { describe, expect, it } from "vitest";

import type { Candle, MarketDataProvider } from "../../types/market";
import { runBacktest } from "./engine";

const symbols = ["QQQ", "SPY", "XLF", "XLV", "GLD", "TLT"];

function makeDailyCandles(symbol: string): Candle[] {
  const candles: Candle[] = [];
  const start = new Date("2022-01-03T00:00:00Z");

  for (let index = 0; index < 520; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);

    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
      continue;
    }

    const drift = symbol === "SPY" ? 0.12 : 0.08;
    const close = 100 + candles.length * drift;

    candles.push({
      symbol,
      date: date.toISOString(),
      open: close,
      high: close,
      low: close,
      close,
      adjustedClose: close,
      volume: 1_000_000,
      source: "test",
    });
  }

  return candles;
}

const provider: MarketDataProvider = {
  id: "test",
  async getDailyCandles({ symbol, count }) {
    return makeDailyCandles(symbol).slice(-count);
  },
  async getHistoricalDailyCandles({ symbol, startDate, endDate }) {
    const start = new Date(startDate ?? "1900-01-01").getTime();
    const end = new Date(endDate ?? "2999-01-01").getTime();

    return makeDailyCandles(symbol).filter((candle) => {
      const time = new Date(candle.date).getTime();
      return time >= start && time <= end;
    });
  },
};

describe("runBacktest", () => {
  it("runs a deterministic rebalance simulation", async () => {
    const result = await runBacktest(
      {
        symbols,
        strategy: "balanced",
        startDate: "2022-01-03",
        endDate: "2023-12-29",
        rebalanceFrequency: "quarterly",
        rebalanceMode: "scheduled",
        driftThresholdPct: 5,
        returnBasis: "localPrice",
        initialCapital: 10_000,
        transactionCostBps: 5,
        slippageBps: 0,
        benchmarkSymbol: "SPY",
      },
      provider
    );

    expect(result.provider).toBe("test");
    expect(result.rebalances.length).toBeGreaterThan(0);
    expect(result.equityCurve.length).toBeGreaterThan(10);
    expect(result.summary.endValue).toBeGreaterThan(9_000);
    expect(result.summary.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.summary.sharpeRatio).toBeGreaterThanOrEqual(0);
    expect(result.benchmark?.symbol).toBe("SPY");
  });

  it("can reduce rebalance events with threshold mode", async () => {
    const scheduled = await runBacktest(
      {
        symbols,
        strategy: "balanced",
        startDate: "2022-01-03",
        endDate: "2023-12-29",
        rebalanceFrequency: "monthly",
        rebalanceMode: "scheduled",
        driftThresholdPct: 5,
        returnBasis: "localPrice",
        initialCapital: 10_000,
        transactionCostBps: 5,
        slippageBps: 0,
        benchmarkSymbol: "SPY",
      },
      provider
    );
    const threshold = await runBacktest(
      {
        symbols,
        strategy: "balanced",
        startDate: "2022-01-03",
        endDate: "2023-12-29",
        rebalanceFrequency: "monthly",
        rebalanceMode: "threshold",
        driftThresholdPct: 99,
        returnBasis: "localPrice",
        initialCapital: 10_000,
        transactionCostBps: 5,
        slippageBps: 0,
        benchmarkSymbol: "SPY",
      },
      provider
    );

    expect(threshold.rebalances.length).toBeLessThanOrEqual(
      scheduled.rebalances.length
    );
  });
});
