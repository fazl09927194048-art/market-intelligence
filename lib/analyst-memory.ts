import type { AnalystOpinion } from './analyst-brain';

export type MemoryKind = 'OBSERVATION' | 'PREDICTION' | 'OUTCOME' | 'LESSON' | 'CONFLICT' | 'FACT';
export type AnalystOutcome = 'WIN' | 'LOSS' | 'INVALIDATED' | 'OPEN';

export type AnalystMemoryRecord = {
  id: string;
  analystId: string;
  kind: MemoryKind;
  timestamp: string;
  symbol: string;
  regime: string;
  summary: string;
  evidence: string[];
  tags: string[];
  confidence: number;
  outcome?: AnalystOutcome;
  returnPct?: number;
};

export type AnalystProfile = {
  analystId: string;
  observations: number;
  evaluatedPredictions: number;
  wins: number;
  losses: number;
  invalidated: number;
  open: number;
  winRate: number | null;
  averageReturnPct: number | null;
  confidenceReliability: number;
  currentWeight: number;
  specialization: string[];
  recentLessons: string[];
  lastUpdated: string | null;
};

const MAX_RECORDS = 20000;
const MAX_LESSONS_PER_ANALYST = 80;
const records: AnalystMemoryRecord[] = [];
const weights = new Map<string, number>();

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function ensureWeight(id: string) {
  if (!weights.has(id)) weights.set(id, 1);
  return weights.get(id) ?? 1;
}

function hashId(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return `${Date.now().toString(36)}-${(h >>> 0).toString(36)}`;
}

export function remember(record: Omit<AnalystMemoryRecord, 'id' | 'timestamp'>) {
  const item: AnalystMemoryRecord = { ...record, id: hashId(`${record.analystId}:${record.kind}:${record.summary}`), timestamp: new Date().toISOString() };
  records.push(item);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  return item;
}

export function rememberAnalystOpinions(symbol: string, regime: string, opinions: AnalystOpinion[]) {
  for (const opinion of opinions) {
    remember({
      analystId: opinion.id,
      kind: 'PREDICTION',
      symbol,
      regime,
      summary: `${opinion.direction} ${opinion.score} / ${opinion.confidence}%`,
      evidence: opinion.evidence.slice(0, 12),
      tags: [opinion.direction, regime, opinion.independentMethod],
      confidence: opinion.confidence,
    });
  }
}

export function recordAnalystOutcome(analystId: string, symbol: string, regime: string, outcome: AnalystOutcome, returnPct: number, lesson: string) {
  remember({
    analystId,
    kind: outcome === 'OPEN' ? 'OBSERVATION' : 'OUTCOME',
    symbol,
    regime,
    summary: `${outcome}: ${returnPct.toFixed(4)}%`,
    evidence: [lesson],
    tags: [outcome, regime],
    confidence: 100,
    outcome,
    returnPct,
  });
  if (lesson.trim()) remember({
    analystId,
    kind: 'LESSON',
    symbol,
    regime,
    summary: lesson.trim(),
    evidence: [],
    tags: [regime],
    confidence: 100,
  });
  adaptWeight(analystId);
}

function adaptWeight(analystId: string) {
  const evaluated = records.filter(r => r.analystId === analystId && r.kind === 'OUTCOME' && r.outcome !== 'OPEN');
  if (evaluated.length < 20) return;
  const wins = evaluated.filter(r => r.outcome === 'WIN').length;
  const avg = evaluated.reduce((s, r) => s + (r.returnPct ?? 0), 0) / evaluated.length;
  const rawWinRate = wins / evaluated.length;
  // Bayesian shrinkage toward 50% prevents a small lucky streak from dominating.
  const smoothedWinRate = (wins + 10) / (evaluated.length + 20);
  const performance = clamp((smoothedWinRate - 0.5) * 2 + clamp(avg / 5, -1, 1), -1, 1);
  weights.set(analystId, Number(clamp(1 + performance * 0.45, 0.55, 1.45).toFixed(4)));
  void rawWinRate;
}

export function getAnalystMemory(analystId: string, limit = 24) {
  return records.filter(r => r.analystId === analystId).slice(-Math.max(1, Math.min(200, limit)));
}

export function getAnalystProfile(analystId: string): AnalystProfile {
  const mine = records.filter(r => r.analystId === analystId);
  const outcomes = mine.filter(r => r.kind === 'OUTCOME' && r.outcome);
  const evaluated = outcomes.filter(r => r.outcome !== 'OPEN');
  const wins = evaluated.filter(r => r.outcome === 'WIN').length;
  const losses = evaluated.filter(r => r.outcome === 'LOSS').length;
  const invalidated = evaluated.filter(r => r.outcome === 'INVALIDATED').length;
  const open = outcomes.filter(r => r.outcome === 'OPEN').length;
  const returns = evaluated.map(r => r.returnPct ?? 0);
  const averageReturnPct = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null;
  const winRate = evaluated.length ? wins / evaluated.length : null;
  const recent = mine.filter(r => r.kind === 'LESSON').slice(-MAX_LESSONS_PER_ANALYST);
  const confidences = mine.filter(r => r.kind === 'PREDICTION' && r.outcome !== undefined);
  const confidenceReliability = confidences.length ? clamp(1 - Math.abs((winRate ?? 0.5) - 0.5), 0.5, 1) : 0.5;
  const tags = new Map<string, number>();
  for (const r of mine.slice(-500)) for (const tag of r.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  const specialization = [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag);
  return {
    analystId,
    observations: mine.length,
    evaluatedPredictions: evaluated.length,
    wins,
    losses,
    invalidated,
    open,
    winRate,
    averageReturnPct,
    confidenceReliability,
    currentWeight: ensureWeight(analystId),
    specialization,
    recentLessons: recent.slice(-8).map(r => r.summary),
    lastUpdated: mine.at(-1)?.timestamp ?? null,
  };
}

export function getAllAnalystProfiles(analystIds: string[]) {
  return analystIds.map(getAnalystProfile);
}

export function buildMemoryContext(analystId: string) {
  const profile = getAnalystProfile(analystId);
  const memories = getAnalystMemory(analystId, 12);
  return { profile, memories };
}
