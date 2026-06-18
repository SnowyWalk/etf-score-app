import { defaultEtfUniverse } from "@/data/etf-metadata";
import { sampleEtfs } from "@/data/sample-etfs";
import type { EtfRawData } from "@/types/etf";
import type { Candle, EtfMarketSnapshot } from "@/types/market";
import { buildEtfRowsFromCandles, getLatestCandleDate } from "./metrics";
import { getConfiguredMarketProvider } from "./provider";

const CANDLE_COUNT_FOR_SCORING = 320;
const CACHE_TTL_MS = 15 * 60 * 1000;

let snapshotCache:
  | {
      expiresAt: number;
      snapshot: EtfMarketSnapshot;
    }
  | undefined;

function buildSampleSnapshot(warnings: string[] = []): EtfMarketSnapshot {
  const asOf = new Date().toISOString();

  return {
    etfs: sampleEtfs,
    status: {
      provider: "sample",
      freshness: "sample",
      asOf,
      isFallback: true,
      warnings,
    },
    metricsAsOf: asOf,
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

async function fetchProviderSnapshot(
  symbols: string[]
): Promise<EtfMarketSnapshot> {
  const provider = getConfiguredMarketProvider();
  const candlesBySymbol: Record<string, Candle[]> = {};

  for (const symbol of symbols) {
    candlesBySymbol[symbol] = await provider.getDailyCandles({
      symbol,
      count: CANDLE_COUNT_FOR_SCORING,
    });
  }

  const etfs = buildEtfRowsFromCandles(candlesBySymbol);
  const missingSymbols = symbols.filter(
    (symbol) => !etfs.some((etf) => etf.symbol === symbol)
  );
  const warnings = missingSymbols.map(
    (symbol) => `${symbol} did not have enough candle data for scoring.`
  );
  const metricsAsOf = getLatestCandleDate(candlesBySymbol);

  return {
    etfs,
    status: {
      provider: provider.id,
      freshness: "eod",
      asOf: metricsAsOf,
      isFallback: false,
      warnings,
    },
    metricsAsOf,
    universeVersion: "default-etf-universe-v1",
    metadataVersion: "etf-metadata-v1",
  };
}

export async function getEtfMarketSnapshot(input?: {
  symbols?: string;
  forceRefresh?: boolean;
}): Promise<EtfMarketSnapshot> {
  const symbols = parseSymbols(input?.symbols);

  if (
    !input?.forceRefresh &&
    snapshotCache &&
    snapshotCache.expiresAt > Date.now()
  ) {
    return snapshotCache.snapshot;
  }

  try {
    const snapshot = await fetchProviderSnapshot(symbols);

    if (snapshot.etfs.length === 0) {
      throw new Error("Provider returned no scorable ETF rows.");
    }

    snapshotCache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      snapshot,
    };

    return snapshot;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Toss Open API error.";

    if (snapshotCache) {
      return {
        ...snapshotCache.snapshot,
        status: {
          ...snapshotCache.snapshot.status,
          warnings: [
            ...snapshotCache.snapshot.status.warnings,
            `Using cached market data because refresh failed: ${message}`,
          ],
        },
      };
    }

    return buildSampleSnapshot([
      `Market data refresh failed. Using local sample data: ${message}`,
    ]);
  }
}

export function getSampleEtfs(): EtfRawData[] {
  return sampleEtfs;
}
