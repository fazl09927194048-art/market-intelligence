import { Pool } from 'pg';

let pool: Pool | undefined;
let schemaReady: Promise<void> | undefined;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

async function ensureSchema(db: Pool) {
  schemaReady ||= db.query(`
    CREATE TABLE IF NOT EXISTS shared_market_watchlist (
      symbol TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT NOT NULL DEFAULT 'site'
    )
  `).then(() => undefined).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
}

export async function getCustomMarketSymbols(): Promise<string[]> {
  const db = getPool();
  if (!db) return [];
  await ensureSchema(db);
  const result = await db.query<{ symbol: string }>(
    'SELECT symbol FROM shared_market_watchlist ORDER BY created_at ASC LIMIT 20'
  );
  return result.rows.map(row => row.symbol);
}

export async function addCustomMarketSymbol(symbol: string): Promise<string[]> {
  const db = getPool();
  if (!db) throw new Error('Shared database is not configured; set DATABASE_URL to synchronize custom symbols across devices.');
  await ensureSchema(db);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize add operations so concurrent requests cannot exceed the 20-symbol limit.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('shared_market_watchlist_limit'))");
    const existing = await client.query<{ count: string; present: boolean }>(
      'SELECT COUNT(*)::text AS count, COALESCE(BOOL_OR(symbol = $1), FALSE) AS present FROM shared_market_watchlist',
      [symbol]
    );
    if (Number(existing.rows[0]?.count || 0) >= 20 && !existing.rows[0]?.present) {
      throw new Error('The shared watchlist is full (20 custom symbols). Remove an unused symbol before adding another.');
    }
    await client.query(
      'INSERT INTO shared_market_watchlist(symbol) VALUES($1) ON CONFLICT(symbol) DO NOTHING',
      [symbol]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const result = await db.query<{ symbol: string }>(
    'SELECT symbol FROM shared_market_watchlist ORDER BY created_at ASC LIMIT 20'
  );
  return result.rows.map(row => row.symbol);
}

export async function removeCustomMarketSymbol(symbol: string): Promise<string[]> {
  const db = getPool();
  if (!db) throw new Error('Shared database is not configured; set DATABASE_URL to synchronize custom symbols across devices.');
  await ensureSchema(db);
  await db.query('DELETE FROM shared_market_watchlist WHERE symbol = $1', [symbol]);
  const result = await db.query<{ symbol: string }>(
    'SELECT symbol FROM shared_market_watchlist ORDER BY created_at ASC LIMIT 20'
  );
  return result.rows.map(row => row.symbol);
}
