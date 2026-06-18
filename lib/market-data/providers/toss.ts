import { getTossDailyCandles } from "@/lib/toss/client";
import type { MarketDataProvider } from "@/types/market";

export const tossMarketDataProvider: MarketDataProvider = {
  id: "tossinvest",
  getDailyCandles({ symbol, count }) {
    return getTossDailyCandles(symbol, count);
  },
  async getHistoricalDailyCandles({ symbol, startDate, endDate }) {
    const candles = await getTossDailyCandles(symbol, 1000);
    const start = startDate ? new Date(startDate).getTime() : -Infinity;
    const end = endDate ? new Date(endDate).getTime() : Infinity;

    return candles.filter((candle) => {
      const time = new Date(candle.date).getTime();
      return time >= start && time <= end;
    });
  },
};
