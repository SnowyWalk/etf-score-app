import type { EtfRawData, ReturnBasis } from "./etf";

export type DataFreshness = "realtime" | "delayed" | "eod" | "sample";

export type Candle = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose?: number;
  volume?: number;
  currency?: string;
  source: string;
};

export type MarketDataStatus = {
  provider: string;
  freshness: DataFreshness;
  asOf: string;
  isFallback: boolean;
  warnings: string[];
};

export type EtfMarketSnapshot = {
  etfs: EtfRawData[];
  status: MarketDataStatus;
  metricsAsOf: string;
  returnBasis: ReturnBasis;
  displayCurrency: string;
  universeVersion: string;
  metadataVersion: string;
};

export type MarketDataProvider = {
  id: string;
  getDailyCandles(input: {
    symbol: string;
    count: number;
  }): Promise<Candle[]>;
  getHistoricalDailyCandles(input: {
    symbol: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Candle[]>;
};

export type TossAccount = {
  accountNo: string;
  accountSeq: number;
  accountType: string;
};

export type TossHoldingItem = {
  symbol: string;
  name: string;
  marketCountry: string;
  currency: string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
};

export type TossAccountSnapshot = {
  provider: "tossinvest";
  asOf: string;
  accountSeq?: number;
  accounts: TossAccount[];
  holdings?: {
    items: TossHoldingItem[];
    raw: unknown;
  };
  warnings: string[];
};
