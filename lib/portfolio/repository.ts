import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import type {
  ManualTrade,
  PortfolioState,
  Position,
  StrategyPolicy,
} from "@/types/portfolio";
import { DEFAULT_POLICY } from "./policy";

const DB_PATH = path.join(process.cwd(), "data", "local", "portfolio.sqlite");

let db: Database.Database | undefined;

function getDb() {
  if (!db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }

  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS strategy_policy (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      riskProfile TEXT NOT NULL,
      rebalanceFrequency TEXT NOT NULL,
      driftThresholdPct REAL NOT NULL,
      minLiquidityScore REAL NOT NULL,
      maxSingleEtfWeight REAL NOT NULL,
      cashBufferPct REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_trades (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      tradeDate TEXT NOT NULL,
      fee REAL NOT NULL,
      fxRate REAL NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      symbol TEXT PRIMARY KEY,
      quantity REAL NOT NULL,
      avgPrice REAL NOT NULL,
      currency TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rebalance_runs (
      id TEXT PRIMARY KEY,
      policyId TEXT NOT NULL,
      asOf TEXT NOT NULL,
      marketRegime TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rebalance_orders (
      id TEXT PRIMARY KEY,
      rebalanceRunId TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      estimatedPrice REAL NOT NULL,
      estimatedAmount REAL NOT NULL,
      status TEXT NOT NULL,
      tossOrderId TEXT
    );
  `);

  const existing = database
    .prepare("SELECT id FROM strategy_policy WHERE id = ?")
    .get(DEFAULT_POLICY.id);

  if (!existing) {
    database
      .prepare(
        `INSERT INTO strategy_policy (
          id, name, riskProfile, rebalanceFrequency, driftThresholdPct,
          minLiquidityScore, maxSingleEtfWeight, cashBufferPct
        ) VALUES (
          @id, @name, @riskProfile, @rebalanceFrequency, @driftThresholdPct,
          @minLiquidityScore, @maxSingleEtfWeight, @cashBufferPct
        )`
      )
      .run(DEFAULT_POLICY);
  }
}

export function getPortfolioState(): PortfolioState {
  const database = getDb();
  const policy =
    (database
      .prepare("SELECT * FROM strategy_policy WHERE id = ?")
      .get(DEFAULT_POLICY.id) as StrategyPolicy | undefined) ?? DEFAULT_POLICY;
  const positions = database
    .prepare("SELECT * FROM positions ORDER BY symbol")
    .all() as Position[];
  const manualTrades = database
    .prepare("SELECT * FROM manual_trades ORDER BY tradeDate DESC, id DESC LIMIT 50")
    .all() as ManualTrade[];

  return { policy, positions, manualTrades };
}

export function updateStrategyPolicy(
  patch: Partial<
    Pick<
      StrategyPolicy,
      | "rebalanceFrequency"
      | "driftThresholdPct"
      | "minLiquidityScore"
      | "maxSingleEtfWeight"
      | "cashBufferPct"
    >
  >
) {
  const current = getPortfolioState().policy;
  const next: StrategyPolicy = {
    ...current,
    ...patch,
    driftThresholdPct: Number(patch.driftThresholdPct ?? current.driftThresholdPct),
    minLiquidityScore: Number(patch.minLiquidityScore ?? current.minLiquidityScore),
    maxSingleEtfWeight: Number(
      patch.maxSingleEtfWeight ?? current.maxSingleEtfWeight
    ),
    cashBufferPct: Number(patch.cashBufferPct ?? current.cashBufferPct),
  };

  getDb()
    .prepare(
      `UPDATE strategy_policy
        SET rebalanceFrequency = @rebalanceFrequency,
            driftThresholdPct = @driftThresholdPct,
            minLiquidityScore = @minLiquidityScore,
            maxSingleEtfWeight = @maxSingleEtfWeight,
            cashBufferPct = @cashBufferPct
        WHERE id = @id`
    )
    .run(next);

  return next;
}

export function recordManualTrade(input: Omit<ManualTrade, "id" | "source">) {
  const database = getDb();
  const trade: ManualTrade = {
    ...input,
    id: crypto.randomUUID(),
    symbol: input.symbol.toUpperCase(),
    source: "manual",
  };

  const transaction = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO manual_trades (
          id, symbol, side, quantity, price, currency, tradeDate, fee, fxRate, source
        ) VALUES (
          @id, @symbol, @side, @quantity, @price, @currency, @tradeDate, @fee, @fxRate, @source
        )`
      )
      .run(trade);

    const current = database
      .prepare("SELECT * FROM positions WHERE symbol = ?")
      .get(trade.symbol) as Position | undefined;
    const signedQuantity = trade.side === "buy" ? trade.quantity : -trade.quantity;
    const nextQuantity = Math.max(0, (current?.quantity ?? 0) + signedQuantity);
    const nextAvgPrice =
      trade.side === "buy"
        ? ((current?.quantity ?? 0) * (current?.avgPrice ?? 0) +
            trade.quantity * trade.price +
            trade.fee) /
          Math.max(1e-9, (current?.quantity ?? 0) + trade.quantity)
        : current?.avgPrice ?? trade.price;

    if (nextQuantity <= 0) {
      database.prepare("DELETE FROM positions WHERE symbol = ?").run(trade.symbol);
      return;
    }

    database
      .prepare(
        `INSERT INTO positions (symbol, quantity, avgPrice, currency, updatedAt)
          VALUES (@symbol, @quantity, @avgPrice, @currency, @updatedAt)
          ON CONFLICT(symbol) DO UPDATE SET
            quantity = excluded.quantity,
            avgPrice = excluded.avgPrice,
            currency = excluded.currency,
            updatedAt = excluded.updatedAt`
      )
      .run({
        symbol: trade.symbol,
        quantity: nextQuantity,
        avgPrice: nextAvgPrice,
        currency: trade.currency,
        updatedAt: new Date().toISOString(),
      });
  });

  transaction();
  return trade;
}
