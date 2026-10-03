import { Pool } from 'pg';

let pool: Pool | null = null;
let ready = false;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

export async function ensureDroLearningSchema() {
  const db = getPool();
  if (!db || ready) return Boolean(db);
  await db.query(`
    CREATE TABLE IF NOT EXISTS dro_predictions (
      id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      symbol TEXT NOT NULL, interval TEXT NOT NULL, direction TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0, entry DOUBLE PRECISION,
      target DOUBLE PRECISION, stop_loss DOUBLE PRECISION, outcome TEXT,
      actual_direction TEXT, evaluated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_dro_predictions_symbol_created
      ON dro_predictions(symbol, created_at DESC);
  `);
  ready = true; return true;
}

export async function persistPrediction(item: any) {
  const db = getPool(); if (!db) return false; await ensureDroLearningSchema();
  await db.query(`INSERT INTO dro_predictions
    (id,created_at,symbol,interval,direction,confidence,entry,target,stop_loss)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
    [item.id,item.createdAt,item.symbol,item.interval,item.direction,item.confidence,item.entry ?? null,item.target ?? null,item.stopLoss ?? null]);
  return true;
}

export async function persistEvaluation(item: any) {
  const db = getPool(); if (!db) return false; await ensureDroLearningSchema();
  await db.query(`UPDATE dro_predictions SET outcome=$2,actual_direction=$3,evaluated_at=$4 WHERE id=$1`,
    [item.id,item.outcome,item.actualDirection,item.evaluatedAt]); return true;
}

export async function getPersistentMetrics(symbol?: string) {
  const db = getPool(); if (!db) return null; await ensureDroLearningSchema();
  const params: any[] = []; const where = symbol ? 'WHERE symbol=$1' : '';
  if (symbol) params.push(symbol);
  const sql = `SELECT COUNT(*)::int samples, COUNT(*) FILTER (WHERE outcome IS NOT NULL)::int evaluated, COUNT(*) FILTER (WHERE outcome='WIN')::int wins, COUNT(*) FILTER (WHERE outcome='LOSS')::int losses, COUNT(*) FILTER (WHERE outcome='NEUTRAL')::int neutral, COUNT(*) FILTER (WHERE outcome IS NOT NULL AND direction=actual_direction)::int directional, COALESCE(AVG(confidence),0) avg_confidence FROM dro_predictions ` + where;
  const { rows } = await db.query(sql, params); const r = rows[0] || {}; const evaluated=Number(r.evaluated||0);
  const wl=Number(r.wins||0)+Number(r.losses||0);
  return {samples:Number(r.samples||0),evaluated,wins:Number(r.wins||0),losses:Number(r.losses||0),neutral:Number(r.neutral||0),accuracy:evaluated?Number(((Number(r.directional||0)/evaluated)*100).toFixed(2)):0,winRate:wl?Number(((Number(r.wins||0)/wl)*100).toFixed(2)):0,avgConfidence:Number(Number(r.avg_confidence||0).toFixed(2))};
}