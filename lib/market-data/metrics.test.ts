import { describe, expect, it } from "vitest";

import type { Candle } from "@/types/market";
import { buildEtfRowsFromCandles } from "./metrics";

function makeCandles(symbol: string, closes: number[]): Candle[] {
  return closes.map((close, index) => ({
    symbol,
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    adjustedClose: close,
    volume: 1_000_000 + index,
    currency: "USD",
    source: "test",
  }));
}

describe("buildEtfRowsFromCandles", () => {
  it("builds scoring-compatible ETF rows from candle history", () => {
    const rows = buildEtfRowsFromCandles({
      SPY: makeCandles(
        "SPY",
        Array.from({ length: 320 }, (_, index) => 100 + index)
      ),
      GLD: makeCandles(
        "GLD",
        Array.from({ length: 320 }, (_, index) => 200 + index * 0.5)
      ),
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      symbol: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      category: "equity",
      role: "equityCore",
    });
    expect(rows[0].return1M).toBeGreaterThan(0);
    expect(rows[0].return12M).toBeGreaterThan(0);
    expect(rows[0].volatility).toBeGreaterThanOrEqual(0);
    expect(rows[0].liquidityScore).toBeGreaterThanOrEqual(0);
  });

  it("drops unknown symbols instead of fabricating metadata", () => {
    const rows = buildEtfRowsFromCandles({
      UNKNOWN: makeCandles("UNKNOWN", [100, 101, 102]),
    });

    expect(rows).toEqual([]);
  });
});
