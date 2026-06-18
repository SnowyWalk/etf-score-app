import { getEtfMetadata } from "../../data/etf-metadata";
import type { EtfRawData, ReturnBasis } from "../../types/etf";
import type { Candle } from "../../types/market";

const TRADING_DAYS_PER_YEAR = 252;
export const USD_KRW_SYMBOL = "KRW=X";

type CandleMap = Record<string, Candle[]>;

type BuildEtfRowsOptions = {
  returnBasis?: ReturnBasis;
  returnCurrency?: string;
};

type NormalizeCandlesOptions = {
  returnBasis: ReturnBasis;
  fxCandles?: Candle[];
};

function toPrice(candle: Candle) {
  return candle.adjustedClose ?? candle.close;
}

function percentReturn(from: number, to: number) {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) {
    return 0;
  }

  return ((to / from) - 1) * 100;
}

function subtractMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() - months);
  return next;
}

function findNearestOnOrBefore(candles: Candle[], target: Date) {
  for (let index = candles.length - 1; index >= 0; index -= 1) {
    if (new Date(candles[index].date) <= target) {
      return candles[index];
    }
  }

  return candles[0];
}

function calculateWindowReturn(candles: Candle[], latest: Candle, months: number) {
  const target = subtractMonths(new Date(latest.date), months);
  const previous = findNearestOnOrBefore(candles, target);

  return percentReturn(toPrice(previous), toPrice(latest));
}

function calculateYtdReturn(candles: Candle[], latest: Candle) {
  const latestDate = new Date(latest.date);
  const yearStart = new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
  const previousYearClose = findNearestOnOrBefore(
    candles,
    new Date(yearStart.getTime() - 1)
  );
  const base = previousYearClose ?? candles[0];

  return percentReturn(toPrice(base), toPrice(latest));
}

function calculateVolatility(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-(lookback + 1));
  const returns: number[] = [];

  for (let index = 1; index < slice.length; index += 1) {
    const previous = toPrice(slice[index - 1]);
    const current = toPrice(slice[index]);

    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }

  if (returns.length < 2) {
    return 0;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (returns.length - 1);

  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

function averageTradedValue(candles: Candle[], lookback = 20) {
  const slice = candles.slice(-lookback);
  const values = slice
    .map((candle) => (candle.volume ?? 0) * toPrice(candle))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeDirect(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return values.map(() => 50);
  }

  return values.map((value) => ((value - min) / (max - min)) * 100);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildEtfRowsFromCandles(
  candlesBySymbol: CandleMap,
  options: BuildEtfRowsOptions = {}
): EtfRawData[] {
  const symbols = Object.keys(candlesBySymbol);
  const tradedValues = symbols.map((symbol) =>
    averageTradedValue(candlesBySymbol[symbol])
  );
  const liquidityScores = normalizeDirect(tradedValues);

  return symbols.flatMap((symbol, index) => {
    const metadata = getEtfMetadata(symbol);
    const candles = [...candlesBySymbol[symbol]].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const latest = candles.at(-1);

    if (!metadata || !latest || candles.length < 2) {
      return [];
    }

    return {
      symbol,
      name: metadata.name,
      market: metadata.market,
      listingCurrency: metadata.listingCurrency,
      baseExposureCurrency: metadata.baseExposureCurrency,
      currencyHedge: metadata.currencyHedge,
      returnBasis: options.returnBasis ?? "localPrice",
      returnCurrency:
        options.returnCurrency ?? latest.currency ?? metadata.listingCurrency,
      category: metadata.category,
      role: metadata.role,
      return1M: round(calculateWindowReturn(candles, latest, 1)),
      return3M: round(calculateWindowReturn(candles, latest, 3)),
      return6M: round(calculateWindowReturn(candles, latest, 6)),
      return12M: round(calculateWindowReturn(candles, latest, 12)),
      returnYTD: round(calculateYtdReturn(candles, latest)),
      volatility: round(calculateVolatility(candles)),
      expenseRatio: metadata.expenseRatio,
      liquidityScore: round(
        tradedValues[index] > 0
          ? liquidityScores[index]
          : metadata.fallbackLiquidityScore
      ),
      diversificationScore: metadata.fallbackDiversificationScore,
    };
  });
}

export function getDisplayCurrency(returnBasis: ReturnBasis) {
  return returnBasis === "krwInvestor" ? "KRW" : "LOCAL";
}

function findFxRateOnOrBefore(fxCandles: Candle[], date: string) {
  const target = new Date(date).getTime();

  for (let index = fxCandles.length - 1; index >= 0; index -= 1) {
    if (new Date(fxCandles[index].date).getTime() <= target) {
      return toPrice(fxCandles[index]);
    }
  }

  return undefined;
}

function convertUsdCandlesToKrw(candles: Candle[], fxCandles: Candle[]) {
  return candles
    .map((candle): Candle | undefined => {
      const fxRate = findFxRateOnOrBefore(fxCandles, candle.date);

      if (!fxRate) {
        return undefined;
      }

      return {
        ...candle,
        open: candle.open * fxRate,
        high: candle.high * fxRate,
        low: candle.low * fxRate,
        close: candle.close * fxRate,
        adjustedClose: (candle.adjustedClose ?? candle.close) * fxRate,
        currency: "KRW",
        source: `${candle.source}+usd-krw`,
      } satisfies Candle;
    })
    .filter((candle): candle is Candle => Boolean(candle));
}

export function normalizeCandlesForReturnBasis(
  candlesBySymbol: CandleMap,
  options: NormalizeCandlesOptions
) {
  const warnings: string[] = [];

  if (options.returnBasis === "localPrice") {
    const currencies = new Set(
      Object.values(candlesBySymbol)
        .map((candles) => candles.at(-1)?.currency)
        .filter(Boolean)
    );

    if (currencies.size > 1) {
      warnings.push(
        "Local price mode compares each ETF in its own listing currency; mixed USD/KRW rows are not FX-normalized."
      );
    }

    return {
      candlesBySymbol,
      displayCurrency: getDisplayCurrency(options.returnBasis),
      warnings,
    };
  }

  const fxCandles = [...(options.fxCandles ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const normalized: CandleMap = {};

  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    const metadata = getEtfMetadata(symbol);
    const listingCurrency =
      metadata?.listingCurrency ?? candles.at(-1)?.currency ?? "USD";

    if (listingCurrency === "USD") {
      if (fxCandles.length === 0) {
        warnings.push(
          `${symbol} is USD-listed but no USD/KRW FX candles were available; local USD prices were used.`
        );
        normalized[symbol] = candles;
      } else {
        normalized[symbol] = convertUsdCandlesToKrw(candles, fxCandles);
      }
      continue;
    }

    normalized[symbol] = candles.map((candle) => ({
      ...candle,
      currency: listingCurrency,
    }));
  }

  return {
    candlesBySymbol: normalized,
    displayCurrency: getDisplayCurrency(options.returnBasis),
    warnings,
  };
}

export function getLatestCandleDate(candlesBySymbol: Record<string, Candle[]>) {
  const timestamps = Object.values(candlesBySymbol)
    .flatMap((candles) => candles.map((candle) => new Date(candle.date).getTime()))
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.max(...timestamps)).toISOString();
}
