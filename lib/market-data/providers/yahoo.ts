import type { Candle, MarketDataProvider } from "@/types/market";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type YahooChartResponse = {
  chart: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};

function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function compactStartDate(count: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(count * 2, 420));
  return date;
}

function parseYahooResponse(symbol: string, payload: YahooChartResponse) {
  const result = payload.chart.result?.[0];

  if (!result) {
    throw new Error(
      payload.chart.error?.description ??
        `Yahoo Finance returned no chart data for ${symbol}.`
    );
  }

  const quote = result.indicators?.quote?.[0];
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const timestamps = result.timestamp ?? [];

  if (!quote || timestamps.length === 0) {
    throw new Error(`Yahoo Finance returned incomplete chart data for ${symbol}.`);
  }

  return timestamps
    .map((timestamp, index): Candle | undefined => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];

      if (open == null || high == null || low == null || close == null) {
        return undefined;
      }

      const candle: Candle = {
        symbol: symbol.toUpperCase(),
        date: new Date(timestamp * 1000).toISOString(),
        open,
        high,
        low,
        close,
        adjustedClose: adjclose[index] ?? close,
        volume: quote.volume?.[index] ?? undefined,
        currency: result.meta?.currency,
        source: "yahoo-finance",
      };

      return candle;
    })
    .filter((candle): candle is Candle => Boolean(candle))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function fetchYahooCandles(input: {
  symbol: string;
  startDate: Date;
  endDate: Date;
}) {
  const params = new URLSearchParams({
    period1: String(unixSeconds(input.startDate)),
    period2: String(unixSeconds(input.endDate)),
    interval: "1d",
    events: "history",
    includeAdjustedClose: "true",
  });
  const response = await fetch(
    `${YAHOO_CHART_URL}/${input.symbol.toUpperCase()}?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed: ${response.status}`);
  }

  return parseYahooResponse(
    input.symbol,
    (await response.json()) as YahooChartResponse
  );
}

export const yahooMarketDataProvider: MarketDataProvider = {
  id: "yahoo-finance",
  async getDailyCandles({ symbol, count }) {
    const candles = await fetchYahooCandles({
      symbol,
      startDate: compactStartDate(count),
      endDate: new Date(),
    });

    return candles.slice(-count);
  },
  getHistoricalDailyCandles({ symbol, startDate, endDate }) {
    return fetchYahooCandles({
      symbol,
      startDate: new Date(startDate ?? "2000-01-01"),
      endDate: new Date(endDate ?? new Date()),
    });
  },
};
