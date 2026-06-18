import { defaultEtfUniverse } from "@/data/etf-metadata";
import { sampleEtfs } from "@/data/sample-etfs";
import type { EtfRawData, ReturnBasis } from "@/types/etf";
import type { Candle, EtfMarketSnapshot } from "@/types/market";
import {
  USD_KRW_SYMBOL,
  buildEtfRowsFromCandles,
  getLatestCandleDate,
  normalizeCandlesForReturnBasis,
} from "./metrics";
import { getConfiguredMarketProvider } from "./provider";

const CANDLE_COUNT_FOR_SCORING = 320;
const CACHE_TTL_MS = 15 * 60 * 1000;

const snapshotCache = new Map<
  string,
  {
    expiresAt: number;
    snapshot: EtfMarketSnapshot;
  }
>();

function buildSampleSnapshot(
  warnings: string[] = [],
  returnBasis: ReturnBasis = "localPrice"
): EtfMarketSnapshot {
  const asOf = new Date().toISOString();

  return {
    etfs: sampleEtfs.map((etf) => ({
      ...etf,
      returnBasis,
      returnCurrency: returnBasis === "krwInvestor" ? "KRW" : etf.returnCurrency,
    })),
    status: {
      provider: "sample",
      freshness: "sample",
      asOf,
      isFallback: true,
      warnings,
    },
    metricsAsOf: asOf,
    returnBasis,
    displayCurrency: returnBasis === "krwInvestor" ? "KRW" : "LOCAL",
    universeVersion: "default-etf-universe-v1",
    metadataVersion: "etf-metadata-v1",
  };
}

function parseSymbols(symbols?: string) {
  if (!symbols) {
    return defaultEtfUniverse;
  }

  const parsed = symbols
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : defaultEtfUniverse;
}

function parseReturnBasis(returnBasis?: string): ReturnBasis {
  return returnBasis === "localPrice" ? "localPrice" : "krwInvestor";
}

function cacheKey(symbols: string[], returnBasis: ReturnBasis) {
  return `${returnBasis}:${symbols.join(",")}`;
}

async function fetchProviderSnapshot(
  symbols: string[],
  returnBasis: ReturnBasis
): Promise<EtfMarketSnapshot> {
  const provider = getConfiguredMarketProvider();
  const candlesBySymbol: Record<string, Candle[]> = {};
  const fetchWarnings: string[] = [];
  let fxCandles: Candle[] = [];

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => ({
      symbol,
      candles: await provider.getDailyCandles({
        symbol,
        count: CANDLE_COUNT_FOR_SCORING,
      }),
    }))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      candlesBySymbol[result.value.symbol] = result.value.candles;
    } else {
      fetchWarnings.push(`ETF data fetch failed: ${result.reason}`);
    }
  }

  if (returnBasis === "krwInvestor") {
    try {
      fxCandles = await provider.getDailyCandles({
        symbol: USD_KRW_SYMBOL,
        count: CANDLE_COUNT_FOR_SCORING,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown FX data error.";
      fetchWarnings.push(`USD/KRW FX data fetch failed: ${message}`);
    }
  }

  const normalized = normalizeCandlesForReturnBasis(candlesBySymbol, {
    returnBasis,
    fxCandles,
  });
  const etfs = buildEtfRowsFromCandles(normalized.candlesBySymbol, {
    returnBasis,
    returnCurrency: normalized.displayCurrency,
  });
  const missingSymbols = symbols.filter(
    (symbol) => !etfs.some((etf) => etf.symbol === symbol)
  );
  const warnings = missingSymbols.map(
    (symbol) => `${symbol} did not have enough candle data for scoring.`
  );
  const qualityWarnings = etfs
    .filter((etf) => etf.dataQuality.status === "excluded")
    .flatMap((etf) =>
      etf.dataQuality.reasons.map(
        (reason) => `${etf.symbol} excluded from scoring: ${reason}`
      )
    );
  const metricsAsOf = getLatestCandleDate(normalized.candlesBySymbol);

  return {
    etfs,
    status: {
      provider: provider.id,
      freshness: "eod",
      asOf: metricsAsOf,
      isFallback: false,
      warnings: [
        ...fetchWarnings,
        ...normalized.warnings,
        ...warnings,
        ...qualityWarnings,
      ],
    },
    metricsAsOf,
    returnBasis,
    displayCurrency: normalized.displayCurrency,
    universeVersion: "default-etf-universe-v1",
    metadataVersion: "etf-metadata-v1",
  };
}

export async function getEtfMarketSnapshot(input?: {
  symbols?: string;
  forceRefresh?: boolean;
  returnBasis?: string;
}): Promise<EtfMarketSnapshot> {
  const symbols = parseSymbols(input?.symbols);
  const returnBasis = parseReturnBasis(input?.returnBasis);
  const key = cacheKey(symbols, returnBasis);
  const cached = snapshotCache.get(key);

  if (
    !input?.forceRefresh &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.snapshot;
  }

  try {
    const snapshot = await fetchProviderSnapshot(symbols, returnBasis);

    if (snapshot.etfs.length === 0) {
      throw new Error("Provider returned no scorable ETF rows.");
    }

    snapshotCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      snapshot,
    });

    return snapshot;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown market data error.";

    if (cached) {
      return {
        ...cached.snapshot,
        status: {
          ...cached.snapshot.status,
          warnings: [
            ...cached.snapshot.status.warnings,
            `Using cached market data because refresh failed: ${message}`,
          ],
        },
      };
    }

    return buildSampleSnapshot([
      `Market data refresh failed. Using local sample data: ${message}`,
    ], returnBasis);
  }
}

export function getSampleEtfs(): EtfRawData[] {
  return sampleEtfs;
}
