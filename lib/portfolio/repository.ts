import "server-only";

import Database from "better-sqlite3";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
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
const AUTH_ID = "primary";
const DEFAULT_PASSWORD_SALT = "a230160178c700203f356dd5b5fb55b9";
const DEFAULT_PASSWORD_HASH =
  "f41bc5a504e9685be3f98ff128347c113dd2ec45fbb46c11aca3bdd850a99014a3eeb8e268f93f2dc31824d2c730fc6c382a3c796aff8b3f2c92aefc7efff68b";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

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

    CREATE TABLE IF NOT EXISTS app_auth (
      id TEXT PRIMARY KEY,
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      tokenHash TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      clientKey TEXT PRIMARY KEY,
      failedAttempts INTEGER NOT NULL,
      blockedUntil TEXT,
      updatedAt TEXT NOT NULL
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

  const existingAuth = database
    .prepare("SELECT id FROM app_auth WHERE id = ?")
    .get(AUTH_ID);

  if (!existingAuth) {
    database
      .prepare(
        `INSERT INTO app_auth (id, passwordHash, passwordSalt, updatedAt)
          VALUES (?, ?, ?, ?)`
      )
      .run(
        AUTH_ID,
        DEFAULT_PASSWORD_HASH,
        DEFAULT_PASSWORD_SALT,
        new Date().toISOString()
      );
  }
}

type AuthCredential = {
  passwordHash: string;
  passwordSalt: string;
};

type AuthRateLimit = {
  failedAttempts: number;
  blockedUntil: string | null;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashClientKey(clientKey: string) {
  return createHash("sha256").update(clientKey).digest("hex");
}

function verifyPassword(password: string, credential: AuthCredential) {
  const actual = scryptSync(password, credential.passwordSalt, 64);
  const expected = Buffer.from(credential.passwordHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function authenticateAppPassword(password: string, clientKey: string) {
  const database = getDb();
  const now = new Date();
  const rateLimitKey = hashClientKey(clientKey);
  const rateLimit = database
    .prepare(
      "SELECT failedAttempts, blockedUntil FROM auth_rate_limits WHERE clientKey = ?"
    )
    .get(rateLimitKey) as AuthRateLimit | undefined;
  const blockedUntil = rateLimit?.blockedUntil
    ? new Date(rateLimit.blockedUntil)
    : undefined;

  if (blockedUntil && blockedUntil.getTime() > now.getTime()) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)
      ),
    };
  }

  const credential = database
    .prepare("SELECT passwordHash, passwordSalt FROM app_auth WHERE id = ?")
    .get(AUTH_ID) as AuthCredential;

  if (!verifyPassword(password, credential)) {
    const failedAttempts = (rateLimit?.failedAttempts ?? 0) + 1;
    const nextBlockedUntil =
      failedAttempts >= MAX_LOGIN_FAILURES
        ? new Date(now.getTime() + LOGIN_LOCK_MS).toISOString()
        : null;

    database
      .prepare(
        `INSERT INTO auth_rate_limits (
          clientKey, failedAttempts, blockedUntil, updatedAt
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(clientKey) DO UPDATE SET
          failedAttempts = excluded.failedAttempts,
          blockedUntil = excluded.blockedUntil,
          updatedAt = excluded.updatedAt`
      )
      .run(rateLimitKey, failedAttempts, nextBlockedUntil, now.toISOString());

    return {
      ok: false as const,
      retryAfterSeconds: nextBlockedUntil ? LOGIN_LOCK_MS / 1000 : undefined,
    };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const transaction = database.transaction(() => {
    database
      .prepare("DELETE FROM auth_rate_limits WHERE clientKey = ?")
      .run(rateLimitKey);
    database
      .prepare("DELETE FROM auth_sessions WHERE expiresAt <= ?")
      .run(now.toISOString());
    database
      .prepare(
        "INSERT INTO auth_sessions (tokenHash, createdAt, expiresAt) VALUES (?, ?, ?)"
      )
      .run(hashSessionToken(token), now.toISOString(), expiresAt.toISOString());
  });

  transaction();

  return { ok: true as const, token, expiresAt };
}

export function isValidAuthSession(token: string | undefined) {
  if (!token) {
    return false;
  }

  const session = getDb()
    .prepare("SELECT expiresAt FROM auth_sessions WHERE tokenHash = ?")
    .get(hashSessionToken(token)) as { expiresAt: string } | undefined;

  return Boolean(session && new Date(session.expiresAt).getTime() > Date.now());
}

export function deleteAuthSession(token: string | undefined) {
  if (!token) {
    return;
  }

  getDb()
    .prepare("DELETE FROM auth_sessions WHERE tokenHash = ?")
    .run(hashSessionToken(token));
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
