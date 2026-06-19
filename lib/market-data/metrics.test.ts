import { describe, expect, it } from "vitest";

import type { Candle } from "@/types/market";
import { buildEtfRowsFromCandles, normalizeCandlesForReturnBasis } from "./metrics";

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
    expect(rows[0].latestPrice).toBe(419);
    expect(rows[0].latestPriceDate).toBe("2025-11-16T00:00:00.000Z");
    expect(rows[0].volatility).toBeGreaterThanOrEqual(0);
    expect(rows[0].liquidityScore).toBeGreaterThanOrEqual(0);
  });

  it("drops unknown symbols instead of fabricating metadata", () => {
    const rows = buildEtfRowsFromCandles({
      UNKNOWN: makeCandles("UNKNOWN", [100, 101, 102]),
    });

    expect(rows).toEqual([]);
  });

  it("converts USD-listed ETF candles to KRW investor basis with USD/KRW FX", () => {
    const candles = makeCandles("SPY", [100, 110]);
    const fxCandles = makeCandles("KRW=X", [1_300, 1_400]);

    const normalized = normalizeCandlesForReturnBasis(
      {
        SPY: candles,
      },
      {
        returnBasis: "krwInvestor",
        fxCandles,
      }
    );

    expect(normalized.displayCurrency).toBe("KRW");
    expect(normalized.warnings).toEqual([]);
    expect(normalized.candlesBySymbol.SPY[0].adjustedClose).toBe(130_000);
    expect(normalized.candlesBySymbol.SPY[1].adjustedClose).toBe(154_000);
  });
});
