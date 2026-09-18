import type { SignalResult } from './signal';

export type DecisionTraceFactor = {
  id: string;
  family: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  score: number;
  confidence: number;
  weight: number;
  contribution: number;
  evidence: string[];
};

export type DecisionTrace = {
  finalDecision: string;
  rawSignal: string;
  consensusDirection: string;
  factors: DecisionTraceFactor[];
  supporting: DecisionTraceFactor[];
  opposing: DecisionTraceFactor[];
  neutral: DecisionTraceFactor[];
  dominantFamily: string | null;
  netContribution: number;
  confidenceBeforeGate: number;
  confidenceAfterGate: number;
  invalidationCodes: string[];
  summary: string;
};

const family=(id:string)=>{
  if(['trend','structure','support','resistance'].includes(id))return 'trend';
  if(['momentum'].includes(id))return 'momentum';
  if(['futures','funding','oi','liquidation','orderflow'].includes(id))return 'derivatives';
  if(['volume','liquidity'].includes(id))return 'flow';
  if(['pattern','breakout','fibonacci'].includes(id))return 'patterns';
  if(['forecast','volatility'].includes(id))return 'forecast';
  if(['news','event','sentiment'].includes(id))return 'news';
  if(['macro','correlation'].includes(id))return 'macro';
  if(['btc','eth','altcoin'].includes(id))return 'assets';
  return 'execution';
};

export function buildDecisionTrace(args:{
  signal:SignalResult;
  consensus:any;
  analysts:any[];
  confidenceGate:any;
  invalidation:any;
}):DecisionTrace{
  const target=args.invalidation?.finalSignal || args.signal.signal;
  const factors:DecisionTraceFactor[]=args.analysts.map(a=>{
    const weight=Number(a.memory?.currentWeight ?? a.weight ?? 1);
    const score=Number(a.score ?? 0);
    const confidence=Number(a.confidence ?? 0);
    const contribution=Number((score*(confidence/100)*weight).toFixed(2));
    return {id:a.id,family:family(a.id),direction:a.direction==='LONG'||a.direction==='SHORT'?a.direction:'NEUTRAL',score,confidence,weight,contribution,evidence:Array.isArray(a.evidence)?a.evidence.slice(0,3):[]};
  });
  const supporting=factors.filter(x=>x.direction===target).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,10);
  const opposing=factors.filter(x=>target!=='NO TRADE'&&x.direction!=='NEUTRAL'&&x.direction!==target).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,10);
  const neutral=factors.filter(x=>x.direction==='NEUTRAL').sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,6);
  const familyTotals=new Map<string,number>();
  for(const x of factors) familyTotals.set(x.family,(familyTotals.get(x.family)||0)+x.contribution);
  const dominantFamily=[...familyTotals.entries()].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0]?.[0]??null;
  const netContribution=Number(factors.reduce((s,x)=>s+x.contribution,0).toFixed(2));
  const invCodes=(args.invalidation?.activeRules||[]).map((x:any)=>x.code);
  const summary=target==='NO TRADE'
    ? `Execution blocked by invalidation engine: ${invCodes.join(', ')||'no directional validation'}.`
    : `${target} is supported primarily by ${dominantFamily||'mixed'} evidence; ${opposing.length} opposing specialist signals remain active.`;
  return {finalDecision:target,rawSignal:args.signal.signal,consensusDirection:args.consensus?.direction||'NEUTRAL',factors,supporting,opposing,neutral,dominantFamily,netContribution,confidenceBeforeGate:Number(args.confidenceGate?.before??args.consensus?.confidence??0),confidenceAfterGate:Number(args.confidenceGate?.after??args.consensus?.confidence??0),invalidationCodes:invCodes,summary};
}
