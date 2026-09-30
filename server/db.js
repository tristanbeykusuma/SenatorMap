import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Production points at a remote libSQL/Turso database, which means no local
// writable disk is required. Locally we fall back to a file: URL, so the same
// code path runs in both environments.
const url =
  process.env.TURSO_DATABASE_URL ||
  process.env.DATABASE_URL ||
  `file:${process.env.DB_PATH || path.join(__dirname, 'denyut.db')}`;

const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export const client = createClient({ url, authToken, intMode: 'number' });

// Turso/libSQL hand out libsql:// URLs, which speak HTTP under the hood, so
// only a file: URL means we are talking to a local database.
export const isRemote = !url.startsWith('file:');

const BATCH_SIZE = 100;

// libSQL binds positionally. better-sqlite3 accepted both run(a, b) and
// run([a, b]); normalise both forms, and map undefined to null because
// libSQL rejects undefined bind values.
function bindArgs(args) {
  const list = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return list.map((v) => (v === undefined ? null : v));
}

// A drop-in stand-in for the better-sqlite3 handle we used before. Every
// method returns a promise, so call sites need `await`. The libSQL Client
// interface exposes `execute()` rather than `prepare()`, so the statement is
// built here and executed per call.
export const db = {
  prepare(sql) {
    const run = (...args) => client.execute({ sql, args: bindArgs(args) });
    return {
      async get(...args) {
        const result = await run(...args);
        return result.rows[0] ?? null;
      },
      async all(...args) {
        const result = await run(...args);
        return result.rows;
      },
      run
    };
  },

  // Multi-statement DDL and the multi-DELETE cleanup paths.
  async exec(sql) {
    await client.executeMultiple(sql);
  }
};

// Runs an array of { sql, args } as chunked, atomic write batches so a bulk
// import does not become one enormous round trip to a remote database.
export async function writeBatch(statements) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await client.batch(
      statements.slice(i, i + BATCH_SIZE).map((s) => ({
        sql: s.sql,
        args: s.args || []
      })),
      'write'
    );
  }
}

// Replaces the old `db.transaction(fn)` helper. The callback receives a
// `run` function that queues statements, then everything is committed as one
// atomic write batch per chunk.
export function transaction(fn) {
  return async (...callArgs) => {
    const queued = [];
    const run = (sql, ...args) => queued.push({ sql, args: bindArgs(args) });
    const result = fn(...callArgs, run);
    if (result && typeof result.then === 'function') await result;
    await writeBatch(queued);
    return result;
  };
}

export async function initDatabase() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS customers (
      cifno TEXT PRIMARY KEY,
      name TEXT,
      segment TEXT,
      branch_code TEXT,
      branch_name TEXT,
      hub_id TEXT,
      status TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cifno TEXT,
      acctno TEXT,
      actype TEXT,
      template_period TEXT,
      cbalrp REAL DEFAULT 0,
      avgbalrp REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      ddctyp TEXT,
      datop6 TEXT,
      status TEXT,
      FOREIGN KEY (cifno) REFERENCES customers(cifno)
    );
    CREATE TABLE IF NOT EXISTS customer_balances (
      cifno TEXT PRIMARY KEY,
      cbalrp REAL DEFAULT 0,
      avgbalrp REAL DEFAULT 0,
      account_count INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      product_breakdown TEXT
    );
    CREATE TABLE IF NOT EXISTS lending_balances (
      cifno TEXT,
      product_type TEXT,
      limit_amount REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      account_count INTEGER DEFAULT 0,
      PRIMARY KEY (cifno, product_type)
    );
    CREATE TABLE IF NOT EXISTS denyut_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cifno TEXT,
      customer_name TEXT,
      signal_type TEXT,
      suggested_product TEXT,
      urgency TEXT,
      status TEXT DEFAULT 'new',
      assigned_rm TEXT,
      detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cifno) REFERENCES customers(cifno)
    );
    CREATE TABLE IF NOT EXISTS default_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_type TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      stats TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS merchant_sorot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER,
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );
    CREATE TABLE IF NOT EXISTS echo_ecosystems (
      id TEXT PRIMARY KEY,
      anchor_name TEXT,
      anchor_segment TEXT,
      branch_code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS echo_businesses (
      id TEXT PRIMARY KEY,
      ecosystem_id TEXT,
      name TEXT,
      segment TEXT,
      business_type TEXT,
      lat REAL,
      lng REAL,
      branch_code TEXT,
      products_held TEXT,
      ecommerce_potential REAL DEFAULT 0,
      social_network_strength REAL DEFAULT 0,
      priority_score REAL DEFAULT 0,
      priority_tier TEXT,
      mandiri_customer INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ecosystem_id) REFERENCES echo_ecosystems(id)
    );
    CREATE TABLE IF NOT EXISTS echo_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ecosystem_id TEXT,
      from_business_id TEXT,
      to_business_id TEXT,
      relationship_type TEXT,
      category TEXT,
      transaction_value REAL DEFAULT 0,
      transaction_volume INTEGER DEFAULT 0,
      closed_loop INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ecosystem_id) REFERENCES echo_ecosystems(id),
      FOREIGN KEY (from_business_id) REFERENCES echo_businesses(id),
      FOREIGN KEY (to_business_id) REFERENCES echo_businesses(id)
    );
  `);
}
