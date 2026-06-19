import type { EtfRole } from "@/types/etf";

export const US_ETF_UNIVERSE = [
  "SPY",
  "VTI",
  "IVV",
  "QQQ",
  "XLK",
  "IWM",
  "SCHD",
  "TLT",
  "IEF",
  "SHY",
  "AGG",
  "BND",
  "GLD",
  "IAU",
] as const;

export const PORTFOLIO_ROLE_LABELS: Record<EtfRole, string> = {
  equityCore: "Core Equity",
  equityGrowth: "Growth/Satellite",
  sectorSatellite: "Growth/Satellite",
  bondDefensive: "Defensive Bond",
  goldHedge: "Gold/Hedge",
  cashLike: "Cash-like Bond",
};

export function isV1UniverseSymbol(symbol: string) {
  return US_ETF_UNIVERSE.includes(symbol.toUpperCase() as typeof US_ETF_UNIVERSE[number]);
}
