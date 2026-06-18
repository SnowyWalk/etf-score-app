# ETF Score Dashboard

Next.js + TypeScript ETF scoring dashboard. It can run with local sample data, or use free historical EOD ETF data for scoring and backtesting.

## Environment

Create `.env.local` from `.env.example`:

```bash
MARKET_DATA_PROVIDER=yahoo

# Optional. Alpha Vantage free keys only support limited recent daily history.
ALPHA_VANTAGE_API_KEY=your_free_alpha_vantage_key

# Optional. Enables AI-generated ETF summaries.
OPENAI_API_KEY=your_openai_api_key
OPENAI_SUMMARY_MODEL=gpt-5.4-mini

# Optional Toss read-only account integration. Not used by default ETF scoring.
TOSS_INVEST_CLIENT_ID=your_client_id
TOSS_INVEST_CLIENT_SECRET=your_client_secret

# Optional. If omitted, the first Toss brokerage account is used.
TOSS_INVEST_ACCOUNT_SEQ=
```

Do not commit real API credentials. If the configured provider fails, the app falls back to local sample ETF data and marks the dashboard as `SAMPLE`.

## Data Sources

- `GET /api/market/etfs` returns a scoring-ready ETF snapshot from the configured EOD data provider.
- `POST /api/backtest` runs the selected strategy over historical daily data.
- `POST /api/ai/summaries` generates ETF summaries through the OpenAI Responses API when `OPENAI_API_KEY` is configured.
- `GET /api/toss/account` returns read-only Toss account and holdings data when credentials are configured.
- Order creation, modification, and cancellation APIs are intentionally not wired.

The dashboard is a scoring support tool, not investment advice. Historical performance and backtest results do not guarantee future returns.

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Verification

```bash
npm run test
npm run lint
npm run build
```

## References

- Toss Open API guide: https://developers.tossinvest.com/docs
- Toss OpenAPI source of truth: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
- Alpha Vantage documentation: https://www.alphavantage.co/documentation/
