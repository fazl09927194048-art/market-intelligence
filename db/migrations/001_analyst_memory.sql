CREATE TABLE IF NOT EXISTS analyst_memory (
  id TEXT PRIMARY KEY,
  analyst_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  regime TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence REAL NOT NULL DEFAULT 0,
  outcome TEXT,
  return_pct REAL,
  source TEXT NOT NULL DEFAULT 'validated-market-loop'
);

CREATE INDEX IF NOT EXISTS analyst_memory_analyst_time_idx
  ON analyst_memory (analyst_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analyst_memory_symbol_time_idx
  ON analyst_memory (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS analyst_memory_kind_idx
  ON analyst_memory (kind);

CREATE TABLE IF NOT EXISTS analyst_profiles (
  analyst_id TEXT PRIMARY KEY,
  observations INTEGER NOT NULL DEFAULT 0,
  evaluated_predictions INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  invalidated INTEGER NOT NULL DEFAULT 0,
  open_count INTEGER NOT NULL DEFAULT 0,
  win_rate REAL,
  average_return_pct REAL,
  confidence_reliability REAL NOT NULL DEFAULT 0.5,
  current_weight REAL NOT NULL DEFAULT 1,
  specialization JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_lessons JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_updated TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS memory_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
