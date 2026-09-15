import type { SignalResult } from './signal';

export type SignalOutcome = 'WIN' | 'LOSS' | 'OPEN' | 'INVALIDATED';

export type SignalEvaluation = {
  outcome: SignalOutcome;
  realizedReturnPct: number | null;
  maxFavorablePct: number | null;
  maxAdversePct: number | null;
  evaluatedAt: string;
  reason: string;
};

export type LearningMetrics = {
  evaluated: number;
  wins: number;
  losses: number;
  open: number;
  invalidated: number;
  winRate: number | null;
  averageReturnPct: number | null;
  profitFactor: number | null;
  averageConfidence: number | null;
};

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function evaluateSignal(signal: SignalResult, futurePrices: number[]): SignalEvaluation {
  const evaluatedAt = new Date().toISOString();
  if (signal.signal === 'NO TRADE' || signal.signal === 'NEUTRAL' || !finite(signal.entry)) {
    return { outcome: 'INVALIDATED', realizedReturnPct: null, maxFavorablePct: null, maxAdversePct: null, evaluatedAt, reason: 'No directional trade setup.' };
  }

  const prices = futurePrices.filter(Number.isFinite);
  if (!prices.length) {
    return { outcome: 'OPEN', realizedReturnPct: null, maxFavorablePct: null, maxAdversePct: null, evaluatedAt, reason: 'No valid future prices available.' };
  }

  const entry = signal.entry;
  const direction = signal.signal === 'LONG' ? 1 : -1;
  const returns = prices.map((p) => ((p - entry) / entry) * 100 * direction);
  const maxFavorablePct = Math.max(...returns);
  const maxAdversePct = Math.min(...returns);
  const tp = signal.takeProfits?.[0];
  const sl = signal.stopLoss;

  const tpIndex = finite(tp) ? prices.findIndex((p) => direction > 0 ? p >= tp : p <= tp) : -1;
  const slIndex = finite(sl) ? prices.findIndex((p) => direction > 0 ? p <= sl : p >= sl) : -1;
  const hitTp = tpIndex >= 0;
  const hitSl = slIndex >= 0;

  let outcome: SignalOutcome = 'OPEN';
  let reason = 'Neither primary target nor stop-loss was reached in the observation window.';
  if (hitTp && hitSl) {
    outcome = tpIndex <= slIndex ? 'WIN' : 'LOSS';
    reason = outcome === 'WIN' ? 'Take-profit was reached before stop-loss.' : 'Stop-loss was reached before take-profit.';
  } else if (hitTp) {
    outcome = 'WIN';
    reason = 'Take-profit threshold reached.';
  } else if (hitSl) {
    outcome = 'LOSS';
    reason = 'Stop-loss threshold reached.';
  }

  return {
    outcome,
    realizedReturnPct: returns[returns.length - 1] ?? null,
    maxFavorablePct,
    maxAdversePct,
    evaluatedAt,
    reason,
  };
}

export function summarizeLearning(evaluations: SignalEvaluation[], signals: SignalResult[] = []): LearningMetrics {
  const closed = evaluations.filter((e) => e.outcome === 'WIN' || e.outcome === 'LOSS');
  const wins = closed.filter((e) => e.outcome === 'WIN').length;
  const losses = closed.filter((e) => e.outcome === 'LOSS').length;
  const gains = closed.filter((e) => (e.realizedReturnPct ?? 0) > 0).reduce((s, e) => s + (e.realizedReturnPct ?? 0), 0);
  const lossAbs = Math.abs(closed.filter((e) => (e.realizedReturnPct ?? 0) < 0).reduce((s, e) => s + (e.realizedReturnPct ?? 0), 0));
  const averageReturnPct = closed.length ? closed.reduce((s, e) => s + (e.realizedReturnPct ?? 0), 0) / closed.length : null;
  const validConfidence = signals.map((e) => e.confidence).filter(Number.isFinite);
  const averageConfidence = validConfidence.length ? validConfidence.reduce((s, e) => s + e, 0) / validConfidence.length : null;
  return {
    evaluated: evaluations.length,
    wins,
    losses,
    open: evaluations.filter((e) => e.outcome === 'OPEN').length,
    invalidated: evaluations.filter((e) => e.outcome === 'INVALIDATED').length,
    winRate: closed.length ? wins / closed.length : null,
    averageReturnPct,
    profitFactor: lossAbs > 0 ? gains / lossAbs : gains > 0 ? Infinity : null,
    averageConfidence,
  };
}
