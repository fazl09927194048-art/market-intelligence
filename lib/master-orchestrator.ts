import type { AnalystOpinion } from './analyst-brain';
import { ANALYSTS } from './analysts';

export type OrchestrationStage = 'TASK_ANALYSIS' | 'SPECIALIST_ROUTING' | 'SPECIALIST_ANALYSIS' | 'CROSS_REVIEW' | 'VALIDATION' | 'FINAL';

type Consensus = { direction: string; confidence: number; score: number; agreement: number; dissent?: Array<unknown> };

export type OrchestrationResult = {
  stages: Array<{name: OrchestrationStage; status: 'complete' | 'blocked'; detail: string}>;
  task: {symbol: string; interval: string; objective: string};
  routing: {totalSpecialists: number; activeSpecialists: number; specialistIds: string[]};
  crossReview: {agreement: number; dissentCount: number; contradictions: string[]};
  validation: {passed: boolean; reasons: string[]};
  final: {direction: string; confidence: number; score: number; safeToAct: boolean};
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function orchestrateAnalysts(symbol: string, interval: string, opinions: AnalystOpinion[], consensus: Consensus): OrchestrationResult {
  const usable = opinions.filter(x => x.id !== 'critic' && x.id !== 'verifier');
  const contradictions = opinions
    .flatMap(x => x.conflicts.map(conflict => `${x.id}: ${conflict}`))
    .slice(0, 12);
  const coverage = opinions.length === ANALYSTS.length;
  const validScores = opinions.every(x => Number.isFinite(x.score) && Number.isFinite(x.confidence));
  const confidence = clamp(Number(consensus.confidence) || 0, 0, 96);
  const blocked = !coverage || !validScores || usable.length < Math.max(10, Math.floor(ANALYSTS.length * 0.6));
  const validationReasons: string[] = [];
  if (!coverage) validationReasons.push(`Specialist coverage incomplete: ${opinions.length}/${ANALYSTS.length}.`);
  if (!validScores) validationReasons.push('One or more specialist outputs contain non-finite scores or confidence.');
  if (usable.length < Math.floor(ANALYSTS.length * 0.6)) validationReasons.push('Too few directional specialists passed the validation gate.');
  if (confidence < 35) validationReasons.push('Final consensus confidence is below the minimum action threshold.');
  if (!validationReasons.length) validationReasons.push('All specialist outputs passed structural validation.');

  return {
    stages: [
      {name: 'TASK_ANALYSIS', status: 'complete', detail: `Analyzing ${symbol} on ${interval} with a market-intelligence objective.`},
      {name: 'SPECIALIST_ROUTING', status: 'complete', detail: `Routed to ${ANALYSTS.length} configured specialist roles.`},
      {name: 'SPECIALIST_ANALYSIS', status: coverage ? 'complete' : 'blocked', detail: `${opinions.length}/${ANALYSTS.length} specialist opinions returned.`},
      {name: 'CROSS_REVIEW', status: 'complete', detail: `${contradictions.length} explicit conflict records and ${consensus.agreement}% directional agreement.`},
      {name: 'VALIDATION', status: blocked ? 'blocked' : 'complete', detail: validationReasons.join(' ')},
      {name: 'FINAL', status: blocked ? 'blocked' : 'complete', detail: blocked ? 'Final output is observation-only until validation passes.' : 'Validated consensus is ready for display.'},
    ],
    task: {symbol, interval, objective: 'Compare independent specialist evidence, detect contradictions, validate data integrity, and synthesize a final market view.'},
    routing: {totalSpecialists: ANALYSTS.length, activeSpecialists: opinions.length, specialistIds: opinions.map(x => x.id)},
    crossReview: {agreement: clamp(Number(consensus.agreement) || 0, 0, 100), dissentCount: consensus.dissent?.length ?? 0, contradictions},
    validation: {passed: !blocked, reasons: validationReasons},
    final: {direction: blocked ? 'NEUTRAL' : consensus.direction, confidence: blocked ? Math.min(confidence, 34) : confidence, score: blocked ? 0 : Math.round(consensus.score), safeToAct: !blocked && confidence >= 35},
  };
}
