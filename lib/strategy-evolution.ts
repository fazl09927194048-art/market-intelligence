import type {BacktestResult} from './learning-lab';
import {ensureStrategyVersionSchema,saveStrategyVersion,listPersistedStrategyVersions} from './strategy-version-store';

export type StrategyCandidate={id:string;parentVersion:string;createdAt:string;metrics:BacktestResult;status:'CANDIDATE'|'PROMOTED'|'REJECTED'|'ROLLED_BACK';reason:string};
const toCandidate=(r:any):StrategyCandidate=>({id:String(r.id),parentVersion:String(r.parent_version),createdAt:new Date(r.created_at).toISOString(),metrics:r.metrics as BacktestResult,status:r.status,reason:String(r.reason||'')});

export async function createCandidate(parentVersion:string,metrics:BacktestResult,reason:string){
 await ensureStrategyVersionSchema();
 const id=`candidate-${Date.now().toString(36)}`;
 await saveStrategyVersion({id,parentVersion,status:'CANDIDATE',metrics,reason});
 return {id,parentVersion,createdAt:new Date().toISOString(),metrics,status:'CANDIDATE' as const,reason};
}
export function evaluateCandidate(c:StrategyCandidate){
 const m=c.metrics;
 return {eligible:m.trades>=30&&m.winRate>=50&&m.profitFactor>1.05&&m.totalReturnPct>0&&m.maxDrawdownPct<15,checks:{sample:m.trades>=30,winRate:m.winRate>=50,profitFactor:m.profitFactor>1.05,return:m.totalReturnPct>0,drawdown:m.maxDrawdownPct<15}};
}
export async function getCandidate(id:string){const rows=await listPersistedStrategyVersions(100);const r=rows.find(x=>String(x.id)===id);return r?toCandidate(r):null;}
export async function promoteCandidate(id:string){
 const c=await getCandidate(id);if(!c)throw new Error('Candidate not found');
 const gate=evaluateCandidate(c);const status=gate.eligible?'PROMOTED':'REJECTED';const reason=gate.eligible?'Passed evaluation gate':'Evaluation gate failed';
 await saveStrategyVersion({id:c.id,parentVersion:c.parentVersion,status,metrics:c.metrics,reason});
 return {...c,status,reason};
}
export async function rollbackCandidate(id:string){
 const c=await getCandidate(id);if(!c)throw new Error('Candidate not found');
 await saveStrategyVersion({id:c.id,parentVersion:c.parentVersion,status:'ROLLED_BACK',metrics:c.metrics,reason:'Manual or safety rollback'});
 return {...c,status:'ROLLED_BACK' as const,reason:'Manual or safety rollback'};
}
export async function listCandidates(){const rows=await listPersistedStrategyVersions(100);return rows.map(toCandidate).filter(c=>['CANDIDATE','PROMOTED','REJECTED','ROLLED_BACK'].includes(c.status));}
