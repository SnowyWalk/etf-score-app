import {
  alphaVantageMarketDataProvider,
  isAlphaVantageConfigured,
} from "./providers/alpha-vantage";
import { tossMarketDataProvider } from "./providers/toss";
import { yahooMarketDataProvider } from "./providers/yahoo";
import { isTossConfigured } from "../toss/client";

export function getConfiguredMarketProvider() {
  const requested = process.env.MARKET_DATA_PROVIDER ?? "yahoo";

  if (requested === "yahoo") {
    return yahooMarketDataProvider;
  }

  if (requested === "tossinvest") {
    if (!isTossConfigured()) {
      throw new Error("Toss Open API credentials are not configured.");
    }

    return tossMarketDataProvider;
  }

  if (requested === "alpha-vantage") {
    if (!isAlphaVantageConfigured()) {
      throw new Error("ALPHA_VANTAGE_API_KEY is not configured.");
    }

    return alphaVantageMarketDataProvider;
  }

  throw new Error(`Unsupported market data provider: ${requested}`);
}
