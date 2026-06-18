import type { Candle, MarketDataProvider } from "@/types/market";

const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";

type CachedSeries = {
  expiresAt: number;
  candles: Candle[];
};

const seriesCache = new Map<string, CachedSeries>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function getApiKey() {
  return process.env.ALPHA_VANTAGE_API_KEY;
}

export function isAlphaVantageConfigured() {
  return Boolean(getApiKey());
}

function parseCsv(text: string, symbol: string) {
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith("{")) {
    throw new Error(`Alpha Vantage returned a non-CSV response for ${symbol}.`);
  }

  const [headerLine, ...rows] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(",").map((header) => header.trim());

  return rows
    .map((row) => {
      const columns = row.split(",");
      const record = Object.fromEntries(
        headers.map((header, index) => [header, columns[index]])
      );
      const close = Number(record.close);

      return {
        symbol,
        date: new Date(`${record.timestamp}T00:00:00Z`).toISOString(),
        open: Number(record.open),
        high: Number(record.high),
        low: Number(record.low),
        close,
        adjustedClose: close,
        volume: Number(record.volume),
        currency: "USD",
        source: "alpha-vantage",
      } satisfies Candle;
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function filterByDateRange(
  candles: Candle[],
  startDate?: string,
  endDate?: string
) {
  const start = startDate ? new Date(startDate).getTime() : -Infinity;
  const end = endDate ? new Date(endDate).getTime() : Infinity;

  return candles.filter((candle) => {
    const time = new Date(candle.date).getTime();
    return time >= start && time <= end;
  });
}

async function fetchFullDailySeries(symbol: string) {
  const key = symbol.toUpperCase();
  const cached = seriesCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.candles;
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("ALPHA_VANTAGE_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    function: "TIME_SERIES_DAILY",
    symbol: key,
    outputsize: "full",
    datatype: "csv",
    apikey: apiKey,
  });
  const response = await fetch(`${ALPHA_VANTAGE_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Alpha Vantage request failed: ${response.status}`);
  }

  const candles = parseCsv(await response.text(), key);

  if (candles.length === 0) {
    throw new Error(`Alpha Vantage returned no daily candles for ${key}.`);
  }

  seriesCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    candles,
  });

  return candles;
}

export const alphaVantageMarketDataProvider: MarketDataProvider = {
  id: "alpha-vantage",
  async getDailyCandles({ symbol, count }) {
    const candles = await fetchFullDailySeries(symbol);
    return candles.slice(-count);
  },
  async getHistoricalDailyCandles({ symbol, startDate, endDate }) {
    const candles = await fetchFullDailySeries(symbol);
    return filterByDateRange(candles, startDate, endDate);
  },
};
