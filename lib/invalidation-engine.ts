import type { SignalResult, SignalSide } from './signal';
import type { TechnicalAnalysis } from './technical';

export type InvalidationSeverity = 'SOFT_INVALIDATION' | 'HARD_INVALIDATION';
export type InvalidationStatus = 'VALID' | 'CAUTION' | 'NO_TRADE';

export type InvalidationRule = {
  code: string;
  severity: InvalidationSeverity;
  triggered: boolean;
  reason: string;
  observableCondition: string;
};

export type InvalidationResult = {
  status: InvalidationStatus;
  finalSignal: SignalSide;
  hardInvalidations: InvalidationRule[];
  softInvalidations: InvalidationRule[];
  activeRules: InvalidationRule[];
  reasons: string[];
  canEnter: boolean;
};

type Gate = { after?: number; penalty?: number; status?: string };
type EventReaction = { level?: string };
type Timeframe = { conflict?: boolean };
type Scenario = { id: string; invalidation?: string };
type ScenarioPack = { scenarios?: Scenario[]; dominant?: string };
type MarketData = {
  symbol?: string;
  fetchedAt?: string;
  futures: { price: number | null; candles: Array<{ close: number; closeTime: number }> };
  spot: { price: number | null };
};

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function evaluateInvalidation(
  signal: SignalResult,
  technical: TechnicalAnalysis,
  data: MarketData,
  options: {
    confidenceGate?: Gate;
    eventReaction?: EventReaction;
    multiTimeframe?: Timeframe;
    scenarios?: ScenarioPack;
  } = {},
): InvalidationResult {
  const price = data.futures.price ?? data.spot.price;
  const rules: InvalidationRule[] = [];
  const add = (rule: InvalidationRule) => rules.push(rule);

  const latestCloseTime = data.futures.candles.at(-1)?.closeTime;
  const candleAgeMs = finite(latestCloseTime) ? Math.max(0, Date.now() - latestCloseTime) : Infinity;
  const fetchedAt = data.fetchedAt ? Date.parse(data.fetchedAt) : NaN;
  const fetchAgeMs = Number.isFinite(fetchedAt) ? Math.max(0, Date.now() - fetchedAt) : Infinity;
  const stale = data.symbol === 'BACKTEST' ? false : Math.max(candleAgeMs, fetchAgeMs) > 120_000;

  add({
    code: 'DATA_STALE',
    severity: 'HARD_INVALIDATION',
    triggered: stale,
    reason: 'Market data is older than the execution freshness window.',
    observableCondition: 'Effective market/candle age > 120 seconds.',
  });

  const insufficient = !finite(price) || data.futures.candles.length < 20 || technical.confidence < 75;
  add({
    code: 'INSUFFICIENT_DATA',
    severity: 'HARD_INVALIDATION',
    triggered: insufficient,
    reason: 'Required price, candle history, or technical coverage is insufficient.',
    observableCondition: 'Missing price, fewer than 20 candles, or technical confidence < 75.',
  });

  const gateDegraded = (options.confidenceGate?.penalty ?? 0) >= 30 || options.confidenceGate?.status === 'DEGRADED';
  add({
    code: 'QUALITY_GATE_DEGRADED',
    severity: 'HARD_INVALIDATION',
    triggered: gateDegraded,
    reason: 'The decision confidence quality gate reports materially degraded context.',
    observableCondition: 'Quality penalty >= 30% or gate status is DEGRADED.',
  });

  const criticalEvent = options.eventReaction?.level === 'CRITICAL';
  add({
    code: 'CRITICAL_EVENT',
    severity: 'HARD_INVALIDATION',
    triggered: criticalEvent,
    reason: 'A critical event reaction is active; directional execution requires fresh confirmation.',
    observableCondition: 'Event reaction level is CRITICAL.',
  });

  const timeframeConflict = options.multiTimeframe?.conflict === true;
  add({
    code: 'TIMEFRAME_CONFLICT',
    severity: 'SOFT_INVALIDATION',
    triggered: timeframeConflict,
    reason: 'Sampled timeframes disagree on directional structure.',
    observableCondition: 'Multi-timeframe conflict flag is true.',
  });

  const highVolatility = technical.volatility.regime === 'HIGH';
  add({
    code: 'HIGH_VOLATILITY',
    severity: 'SOFT_INVALIDATION',
    triggered: highVolatility,
    reason: 'High volatility increases execution and stop-out uncertainty.',
    observableCondition: 'Technical volatility regime is HIGH.',
  });

  const confidenceWeak = signal.signal !== 'NO TRADE' && signal.confidence < 65;
  add({
    code: 'LOW_SIGNAL_CONFIDENCE',
    severity: 'SOFT_INVALIDATION',
    triggered: confidenceWeak,
    reason: 'Directional signal confidence is below the preferred execution threshold.',
    observableCondition: 'Signal confidence < 65%.',
  });

  const stopBreached =
    signal.signal === 'LONG' && finite(signal.stopLoss) && finite(price) && price <= signal.stopLoss ||
    signal.signal === 'SHORT' && finite(signal.stopLoss) && finite(price) && price >= signal.stopLoss;
  add({
    code: 'STOP_OR_INVALIDATION_BREACH',
    severity: 'HARD_INVALIDATION',
    triggered: stopBreached,
    reason: 'Current price has crossed the active signal stop/invalidation level.',
    observableCondition: 'LONG price <= stop-loss or SHORT price >= stop-loss.',
  });

  const bearishStructureAgainstLong = signal.signal === 'LONG' && technical.structure.trend === 'DOWN';
  const bullishStructureAgainstShort = signal.signal === 'SHORT' && technical.structure.trend === 'UP';
  add({
    code: 'STRUCTURE_REVERSAL',
    severity: 'HARD_INVALIDATION',
    triggered: bearishStructureAgainstLong || bullishStructureAgainstShort,
    reason: 'Market structure has moved against the directional signal.',
    observableCondition: 'LONG with DOWN structure or SHORT with UP structure.',
  });

  const dominant = options.scenarios?.dominant;
  const scenarioConflict =
    (signal.signal === 'LONG' && dominant === 'bear') ||
    (signal.signal === 'SHORT' && dominant === 'bull');
  add({
    code: 'DOMINANT_SCENARIO_CONFLICT',
    severity: 'SOFT_INVALIDATION',
    triggered: scenarioConflict,
    reason: 'The dominant scenario is opposite to the current directional signal.',
    observableCondition: 'Dominant scenario is bear for LONG or bull for SHORT.',
  });

  const activeRules = rules.filter(r => r.triggered);
  const hardInvalidations = activeRules.filter(r => r.severity === 'HARD_INVALIDATION');
  const softInvalidations = activeRules.filter(r => r.severity === 'SOFT_INVALIDATION');

  let status: InvalidationStatus = signal.signal === 'NO TRADE' ? 'NO_TRADE' : 'VALID';
  if (hardInvalidations.length > 0) status = 'NO_TRADE';
  else if (softInvalidations.length > 0) status = 'CAUTION';

  const finalSignal: SignalSide =
    hardInvalidations.length > 0 || signal.signal === 'NO TRADE' ? 'NO TRADE' : signal.signal;

  return {
    status,
    finalSignal,
    hardInvalidations,
    softInvalidations,
    activeRules,
    reasons: activeRules.map(r => r.reason),
    canEnter: finalSignal === 'LONG' || finalSignal === 'SHORT',
  };
}
