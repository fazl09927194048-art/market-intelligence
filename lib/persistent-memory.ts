import { Pool } from 'pg';
import type { AnalystMemoryRecord, AnalystOutcome, AnalystProfile } from './analyst-memory';

let pool: Pool | null = null;
let schemaReady = false;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  return pool;
}

const schema = `
CREATE TABLE IF NOT EXISTS analyst_memory (id TEXT PRIMARY KEY, analyst_id TEXT NOT NULL, kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, symbol TEXT NOT NULL, regime TEXT NOT NULL, summary TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '[]'::jsonb, tags JSONB NOT NULL DEFAULT '[]'::jsonb, confidence REAL NOT NULL DEFAULT 0, outcome TEXT, return_pct REAL, source TEXT NOT NULL DEFAULT 'validated-market-loop');
CREATE INDEX IF NOT EXISTS analyst_memory_analyst_time_idx ON analyst_memory (analyst_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analyst_memory_symbol_time_idx ON analyst_memory (symbol, created_at DESC);
CREATE TABLE IF NOT EXISTS analyst_profiles (analyst_id TEXT PRIMARY KEY, observations INTEGER NOT NULL DEFAULT 0, evaluated_predictions INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, invalidated INTEGER NOT NULL DEFAULT 0, open_count INTEGER NOT NULL DEFAULT 0, win_rate REAL, average_return_pct REAL, confidence_reliability REAL NOT NULL DEFAULT 0.5, current_weight REAL NOT NULL DEFAULT 1, specialization JSONB NOT NULL DEFAULT '[]'::jsonb, recent_lessons JSONB NOT NULL DEFAULT '[]'::jsonb, last_updated TIMESTAMPTZ);
`;

async function ensureSchema(db: Pool) {
  if (schemaReady) return;
  await db.query(schema);
  schemaReady = true;
}

export function persistentMemoryEnabled() { return Boolean(process.env.DATABASE_URL); }

export async function persistMemory(record: AnalystMemoryRecord) {
  const db = getPool(); if (!db) return false;
  try {
    await ensureSchema(db);
    await db.query(`INSERT INTO analyst_memory (id, analyst_id, kind, created_at, symbol, regime, summary, evidence, tags, confidence, outcome, return_pct) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12) ON CONFLICT (id) DO NOTHING`, [record.id, record.analystId, record.kind, record.timestamp, record.symbol, record.regime, record.summary, JSON.stringify(record.evidence), JSON.stringify(record.tags), record.confidence, record.outcome ?? null, record.returnPct ?? null]);
    return true;
  } catch { return false; }
}

export async function hydrateAnalystMemory(limit = 20000): Promise<AnalystMemoryRecord[]> {
  const db = getPool(); if (!db) return [];
  try {
    await ensureSchema(db);
    const { rows } = await db.query(`SELECT id, analyst_id, kind, created_at, symbol, regime, summary, evidence, tags, confidence, outcome, return_pct FROM analyst_memory ORDER BY created_at DESC LIMIT $1`, [Math.min(Math.max(limit, 1), 50000)]);
    return rows.reverse().map((r) => ({ id:r.id, analystId:r.analyst_id, kind:r.kind, timestamp:new Date(r.created_at).toISOString(), symbol:r.symbol, regime:r.regime, summary:r.summary, evidence:Array.isArray(r.evidence)?r.evidence:[], tags:Array.isArray(r.tags)?r.tags:[], confidence:Number(r.confidence), outcome:r.outcome ?? undefined, returnPct:r.return_pct == null ? undefined : Number(r.return_pct) }));
  } catch { return []; }
}

export async function persistProfile(profile: AnalystProfile) {
  const db = getPool(); if (!db) return false;
  try {
    await ensureSchema(db);
    await db.query(`INSERT INTO analyst_profiles (analyst_id, observations, evaluated_predictions, wins, losses, invalidated, open_count, win_rate, average_return_pct, confidence_reliability, current_weight, specialization, recent_lessons, last_updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14) ON CONFLICT (analyst_id) DO UPDATE SET observations=EXCLUDED.observations,evaluated_predictions=EXCLUDED.evaluated_predictions,wins=EXCLUDED.wins,losses=EXCLUDED.losses,invalidated=EXCLUDED.invalidated,open_count=EXCLUDED.open_count,win_rate=EXCLUDED.win_rate,average_return_pct=EXCLUDED.average_return_pct,confidence_reliability=EXCLUDED.confidence_reliability,current_weight=EXCLUDED.current_weight,specialization=EXCLUDED.specialization,recent_lessons=EXCLUDED.recent_lessons,last_updated=EXCLUDED.last_updated`, [profile.analystId,profile.observations,profile.evaluatedPredictions,profile.wins,profile.losses,profile.invalidated,profile.open,profile.winRate,profile.averageReturnPct,profile.confidenceReliability,profile.currentWeight,JSON.stringify(profile.specialization),JSON.stringify(profile.recentLessons),profile.lastUpdated]);
    return true;
  } catch { return false; }
}

export async function closePersistentMemory() { if (pool) { await pool.end(); pool = null; schemaReady = false; } }

export type { AnalystOutcome };
