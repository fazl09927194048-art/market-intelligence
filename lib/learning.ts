import type { SignalResult, ForecastResult } from './signal';

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
  if (signal.signal === 'NO TRADE' || signal.signal === 'NEUTRAL' || !finite(signal.entry) || futurePrices.length === 0) {
    return { outcome: 'INVALIDATED', realizedReturnPct: null, maxFavorablePct: null, maxAdversePct: null, evaluatedAt, reason: 'No directional trade setup or insufficient future observations.' };
  }

  const entry = signal.entry;
  const prices = futurePrices.filter(Number.isFinite);
  if (!prices.length) return { outcome:'OPEN', realizedReturnPct:null, maxFavorablePct:null, maxAdversePct:null, evaluatedAt, reason:'No valid future prices available.' };

  const direction = signal.signal === 'LONG' ? 1 : -1;
  const returns = prices.map((p) => ((p - entry) / entry) * 100 * direction);
  const maxFavorablePct = Math.max(...returns);
  const maxAdversePct = Math.min(...returns);
  const tp = signal.takeProfits[0];
  const sl = signal.stopLoss;

  const hitTp = finite(tp) && (direction > 0 ? prices.some((p) => p >= tp) : prices.some((p) => p <= tp));
  const hitSl = finite(sl) && (direction > 0 ? prices.some((p) => p <= sl) : prices.some((p) => p >= sl));
  const outcome: SignalOutcome = hitTp && hitSl ? (returns.findIndex((r) => r >= 0) <= returns.findIndex((r) => r < 0) ? 'WIN' : 'LOSS') : hitTp ? 'WIN' : hitSl ? 'LOSS' : 'OPEN';
  const realizedReturnPct = returns[returns.length - 1] ?? null;
  return { outcome, realizedReturnPct, maxFavorablePct, maxAdversePct, evaluatedAt, reason: outcome === 'WIN' ? 'Take-profit threshold reached.' : outcome === 'LOSS' ? 'Stop-loss threshold reached.' : 'Neither primary target nor stop-loss was reached in the observation window.' };
}

export function summarizeLearning(evaluations: SignalEvaluation[], signals: SignalResult[] = []): LearningMetrics {
  const closed = evaluations.filter((e) => e.outcome === 'WIN' || e.outcome === 'LOSS');
  const wins = closed.filter((e) => e.outcome === 'WIN').length;
  const losses = closed.filter((e) => e.outcome === 'LOSS').length;
  const gains = closed.filter((e) => (e.realizedReturnPct ?? 0) > 0).reduce((s,e) => s + (e.realizedReturnPct ?? 0), 0);
  const lossAbs = Math.abs(closed.filter((e) => (e.realizedReturnPct ?? 0) < 0).reduce((s,e) => s + (e.realizedReturnPct ?? 0), 0));
  const averageReturnPct = closed.length ? closed.reduce((s,e) => s + (e.realizedReturnPct ?? 0), 0) / closed.length : null;
  const averageConfidence = signals.length ? signals.reduce((s,e) => s + e.confidence, 0) / signals.length : null;
  return { evaluated:evaluations.length, wins, losses, open:evaluations.filter(e=>e.outcome==='OPEN').length, invalidated:evaluations.filter(e=>e.outcome==='INVALIDATED').length, winRate:closed.length ? wins / closed.length : null, averageReturnPct, profitFactor:lossAbs > 0 ? gains / lossAbs : gains > 0 ? Infinity : null, averageConfidence };
}
