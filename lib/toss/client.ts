import type {
  Candle,
  TossAccount,
  TossAccountSnapshot,
  TossHoldingItem,
} from "@/types/market";

const TOSS_BASE_URL = "https://openapi.tossinvest.com";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

type TossEnvelope<T> = {
  result: T;
};

type TossCandle = {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
};

type TossCandlePage = {
  candles: TossCandle[];
  nextBefore?: string | null;
};

let tokenCache: TokenCache | undefined;

function getCredentials() {
  const clientId = process.env.TOSS_INVEST_CLIENT_ID;
  const clientSecret = process.env.TOSS_INVEST_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return undefined;
  }

  return { clientId, clientSecret };
}

export function isTossConfigured() {
  return Boolean(getCredentials());
}

async function getAccessToken() {
  const credentials = getCredentials();

  if (!credentials) {
    throw new Error("Toss Open API credentials are not configured.");
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });

  const response = await fetch(`${TOSS_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Toss token request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

async function tossFetch<T>(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(`${TOSS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Toss API request failed: ${response.status} ${path}`);
  }

  return (await response.json()) as TossEnvelope<T>;
}

function parseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCandle(symbol: string, candle: TossCandle): Candle {
  const close = parseNumber(candle.closePrice);

  return {
    symbol,
    date: candle.timestamp,
    open: parseNumber(candle.openPrice),
    high: parseNumber(candle.highPrice),
    low: parseNumber(candle.lowPrice),
    close,
    adjustedClose: close,
    volume: parseNumber(candle.volume),
    currency: candle.currency,
    source: "tossinvest",
  };
}

export async function getTossDailyCandles(symbol: string, count: number) {
  const candles: Candle[] = [];
  let before: string | undefined;

  while (candles.length < count) {
    const pageSize = Math.min(200, count - candles.length);
    const params = new URLSearchParams({
      symbol,
      interval: "1d",
      count: String(pageSize),
      adjusted: "true",
    });

    if (before) {
      params.set("before", before);
    }

    const payload = await tossFetch<TossCandlePage>(
      `/api/v1/candles?${params.toString()}`
    );
    const pageCandles = payload.result.candles.map((candle) =>
      toCandle(symbol, candle)
    );

    candles.push(...pageCandles);

    if (!payload.result.nextBefore || pageCandles.length === 0) {
      break;
    }

    before = payload.result.nextBefore;
  }

  return candles.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

export async function getTossAccounts() {
  const payload = await tossFetch<TossAccount[]>("/api/v1/accounts");
  return payload.result;
}

export async function getTossHoldings(accountSeq: number) {
  const payload = await tossFetch<{
    items: TossHoldingItem[];
  }>("/api/v1/holdings", {
    headers: {
      "X-Tossinvest-Account": String(accountSeq),
    },
  });

  return payload.result;
}

export async function getTossAccountSnapshot(): Promise<TossAccountSnapshot> {
  const accounts = await getTossAccounts();
  const envAccount = process.env.TOSS_INVEST_ACCOUNT_SEQ;
  const accountSeq = envAccount ? Number(envAccount) : accounts[0]?.accountSeq;
  const warnings: string[] = [];

  if (!accountSeq) {
    warnings.push("No Toss brokerage account was returned.");
    return {
      provider: "tossinvest",
      asOf: new Date().toISOString(),
      accounts,
      warnings,
    };
  }

  const holdings = await getTossHoldings(accountSeq);

  return {
    provider: "tossinvest",
    asOf: new Date().toISOString(),
    accountSeq,
    accounts,
    holdings: {
      items: holdings.items,
      raw: holdings,
    },
    warnings,
  };
}
