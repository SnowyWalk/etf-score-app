import type { EtfCategory, EtfRole } from "@/types/etf";

export type EtfMetadata = {
  symbol: string;
  name: string;
  category: EtfCategory;
  role: EtfRole;
  expenseRatio: number;
  fallbackLiquidityScore: number;
  fallbackDiversificationScore: number;
};

export const defaultEtfUniverse = ["QQQ", "SPY", "XLF", "XLV", "GLD", "TLT"];

export const etfMetadata: EtfMetadata[] = [
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    category: "equity",
    role: "equityGrowth",
    expenseRatio: 0.2,
    fallbackLiquidityScore: 96,
    fallbackDiversificationScore: 62,
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    category: "equity",
    role: "equityCore",
    expenseRatio: 0.09,
    fallbackLiquidityScore: 100,
    fallbackDiversificationScore: 78,
  },
  {
    symbol: "XLF",
    name: "Financial Select Sector SPDR Fund",
    category: "sector",
    role: "sectorSatellite",
    expenseRatio: 0.09,
    fallbackLiquidityScore: 91,
    fallbackDiversificationScore: 55,
  },
  {
    symbol: "XLV",
    name: "Health Care Select Sector SPDR Fund",
    category: "sector",
    role: "sectorSatellite",
    expenseRatio: 0.09,
    fallbackLiquidityScore: 89,
    fallbackDiversificationScore: 66,
  },
  {
    symbol: "GLD",
    name: "SPDR Gold Shares",
    category: "gold",
    role: "goldHedge",
    expenseRatio: 0.4,
    fallbackLiquidityScore: 93,
    fallbackDiversificationScore: 86,
  },
  {
    symbol: "TLT",
    name: "iShares 20+ Year Treasury Bond ETF",
    category: "bond",
    role: "bondDefensive",
    expenseRatio: 0.15,
    fallbackLiquidityScore: 90,
    fallbackDiversificationScore: 88,
  },
];

export function getEtfMetadata(symbol: string) {
  return etfMetadata.find((item) => item.symbol === symbol.toUpperCase());
}
