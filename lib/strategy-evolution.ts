import type {BacktestResult} from './learning-lab';

export type StrategyCandidate={id:string;parentVersion:string;createdAt:string;metrics:BacktestResult;status:'CANDIDATE'|'PROMOTED'|'REJECTED'|'ROLLED_BACK';reason:string};

const candidates=new Map<string,StrategyCandidate>();
export function createCandidate(parentVersion:string,metrics:BacktestResult,reason:string){
 const id=`candidate-${Date.now().toString(36)}`;
 const c:StrategyCandidate={id,parentVersion,createdAt:new Date().toISOString(),metrics,status:'CANDIDATE',reason};
 candidates.set(id,c); return c;
}
export function evaluateCandidate(c:StrategyCandidate){
 const m=c.metrics;
 return {eligible:m.trades>=30&&m.winRate>=50&&m.profitFactor>1.05&&m.totalReturnPct>0&&m.maxDrawdownPct<15,checks:{sample:m.trades>=30,winRate:m.winRate>=50,profitFactor:m.profitFactor>1.05,return:m.totalReturnPct>0,drawdown:m.maxDrawdownPct<15}};
}
export function promoteCandidate(id:string){
 const c=candidates.get(id); if(!c)throw new Error('Candidate not found');
 const gate=evaluateCandidate(c); if(!gate.eligible){c.status='REJECTED';c.reason='Evaluation gate failed';return c;}
 c.status='PROMOTED';c.reason='Passed evaluation gate';return c;
}
export function rollbackCandidate(id:string){const c=candidates.get(id);if(!c)throw new Error('Candidate not found');c.status='ROLLED_BACK';c.reason='Manual or safety rollback';return c;}
export function listCandidates(){return [...candidates.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);}
