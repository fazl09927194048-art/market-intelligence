export type CandidateMetrics = {
  accuracy: number;
  winRate: number;
  calibrationGap: number;
  samples: number;
};

export type EvolutionDecision = {
  status: 'PROMOTE' | 'HOLD' | 'ROLLBACK';
  reason: string;
  score: number;
};

export function scoreCandidate(metrics: CandidateMetrics) {
  const sampleFactor = Math.min(1, metrics.samples / 100);
  const accuracy = Math.max(0, Math.min(100, metrics.accuracy));
  const winRate = Math.max(0, Math.min(100, metrics.winRate));
  const calibrationPenalty = Math.min(30, Math.max(0, metrics.calibrationGap));
  return Number(((accuracy * 0.5 + winRate * 0.4 - calibrationPenalty * 0.1) * sampleFactor).toFixed(2));
}

export function evaluateCandidate(candidate: CandidateMetrics, baseline?: CandidateMetrics | null): EvolutionDecision {
  const score = scoreCandidate(candidate);
  if (candidate.samples < 30) return { status:'HOLD', reason:'Insufficient evaluation samples.', score };
  if (candidate.accuracy < 50 || candidate.calibrationGap > 25) return { status:'ROLLBACK', reason:'Candidate failed minimum accuracy/calibration gate.', score };
  if (!baseline) return { status:'PROMOTE', reason:'Candidate passed the initial quality gate.', score };
  const baselineScore = scoreCandidate(baseline);
  if (score >= baselineScore + 2) return { status:'PROMOTE', reason:'Candidate materially improved the measured score.', score };
  if (score < baselineScore - 5) return { status:'ROLLBACK', reason:'Candidate regressed against the baseline.', score };
  return { status:'HOLD', reason:'Difference is not large enough for promotion.', score };
}
