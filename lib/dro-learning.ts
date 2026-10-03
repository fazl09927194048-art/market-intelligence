type PredictionRecord = {
  id: string;
  createdAt: string;
  symbol: string;
  interval: string;
  direction: string;
  confidence: number;
  entry?: number | null;
  target?: number | null;
  stopLoss?: number | null;
  outcome?: 'WIN' | 'LOSS' | 'NEUTRAL' | null;
  actualDirection?: string | null;
  evaluatedAt?: string | null;
};

const records: PredictionRecord[] = [];
const evaluatedIds = new Set<string>();
const MAX_CONTEXT = 40;
const MAX_RECORDS = 5000;

function id() {
  return `pred_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function recordPrediction(input: Omit<PredictionRecord, 'id' | 'createdAt' | 'outcome' | 'actualDirection' | 'evaluatedAt'>) {
  const item: PredictionRecord = { ...input, id: id(), createdAt: new Date().toISOString(), outcome: null, actualDirection: null };
  records.push(item);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  return item;
}

export function evaluatePrediction(predictionId: string, actualDirection: string, outcome: PredictionRecord['outcome']) {
  const item = records.find(x => x.id === predictionId);
  if (!item) return null;
  item.actualDirection = actualDirection;
  item.outcome = outcome;
  item.evaluatedAt = new Date().toISOString();
  evaluatedIds.add(item.id);
  return item;
}

export function getLearningMetrics(symbol?: string) {
  const scoped = records.filter(x => !symbol || x.symbol === symbol);
  const evaluated = scoped.filter(x => x.outcome);
  const wins = evaluated.filter(x => x.outcome === 'WIN').length;
  const losses = evaluated.filter(x => x.outcome === 'LOSS').length;
  const neutral = evaluated.filter(x => x.outcome === 'NEUTRAL').length;
  const directional = evaluated.filter(x => x.direction === x.actualDirection).length;
  const accuracy = evaluated.length ? directional / evaluated.length : 0;
  const winRate = (wins + losses) ? wins / (wins + losses) : 0;
  const avgConfidence = scoped.length ? scoped.reduce((a, x) => a + x.confidence, 0) / scoped.length : 0;
  return {
    samples: scoped.length,
    evaluated: evaluated.length,
    wins,
    losses,
    neutral,
    accuracy: Number((accuracy * 100).toFixed(2)),
    winRate: Number((winRate * 100).toFixed(2)),
    avgConfidence: Number(avgConfidence.toFixed(2)),
    calibrationGap: Number(Math.abs(avgConfidence - accuracy * 100).toFixed(2)),
    lastEvaluatedAt: evaluated.at(-1)?.evaluatedAt ?? null,
  };
}

export function listPredictions(symbol?: string) {
  return records.filter(x => !symbol || x.symbol === symbol).slice(-100);
}


export function getPendingPredictions(limit = 50) {
  return records.filter(x => !x.outcome && !evaluatedIds.has(x.id)).slice(-limit);
}

export function getEvolutionSnapshot(symbol?: string) {
  const metrics = getLearningMetrics(symbol);
  return {
    generatedAt: new Date().toISOString(),
    symbol: symbol || 'ALL',
    metrics,
    pending: getPendingPredictions(25).filter(x => !symbol || x.symbol === symbol),
    status: metrics.evaluated < 30 ? 'WARMING_UP' : metrics.accuracy >= 50 && metrics.calibrationGap <= 25 ? 'HEALTHY' : 'NEEDS_REVIEW',
  };
}


export type ConversationMemory = {
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

const conversationMemory: ConversationMemory[] = [];

export function rememberConversation(role: ConversationMemory['role'], text: string) {
  const clean = String(text || '').trim().slice(0, 2400);
  if (!clean) return;
  conversationMemory.push({ role, text: clean, at: new Date().toISOString() });
  if (conversationMemory.length > MAX_CONTEXT) conversationMemory.splice(0, conversationMemory.length - MAX_CONTEXT);
}

export function getConversationContext(limit = 12) {
  return conversationMemory.slice(-Math.max(1, Math.min(limit, MAX_CONTEXT)));
}

export function clearConversationMemory() {
  conversationMemory.length = 0;
}
