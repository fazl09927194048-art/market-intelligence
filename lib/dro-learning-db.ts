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

export async function evaluateDuePredictions(fetchDirection: (row: { symbol: string; interval: string; direction: string; entry: number | null }) => Promise<string | null>, limit = 50) {
  const db = getPool();
  if (!db) return { evaluated: 0, skipped: 0, persistent: false };
  await ensureDroLearningSchema();
  const { rows } = await db.query(
    `SELECT id,symbol,interval,direction,created_at,target,stop_loss
     FROM dro_predictions
     WHERE outcome IS NULL AND created_at < NOW() - INTERVAL '15 minutes'
     ORDER BY created_at ASC LIMIT $1`, [Math.max(1, Math.min(limit, 200))]
  );
  let evaluated = 0, skipped = 0;
  for (const row of rows) {
    try {
      const actual = await fetchDirection({ symbol: row.symbol, interval: row.interval, direction: row.direction, entry: row.entry === null ? null : Number(row.entry) });
      if (!actual) { skipped++; continue; }
      const normalized = String(actual).toUpperCase();
      const direction = String(row.direction).toUpperCase();
      let outcome = 'NEUTRAL';
      if (direction === normalized) outcome = 'WIN';
      else if (direction !== 'NO TRADE' && normalized !== 'NO TRADE') outcome = 'LOSS';
      await db.query(
        `UPDATE dro_predictions SET outcome=$2,actual_direction=$3,evaluated_at=NOW() WHERE id=$1`,
        [row.id, outcome, normalized]
      );
      evaluated++;
    } catch { skipped++; }
  }
  return { evaluated, skipped, persistent: true };
}
