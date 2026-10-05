import {db} from './exchange/db';
export async function buildLearningReport(){
 const q=await db().query(`SELECT outcome,COUNT(*)::int count,AVG(return_pct)::double precision avg_return FROM forecast_evaluations GROUP BY outcome ORDER BY outcome`).catch(()=>({rows:[] as any[]}));
 const s=await db().query(`SELECT COALESCE(strategy_version,'baseline-unversioned') strategy_version,COUNT(*)::int outcomes,AVG(pnl)::double precision avg_pnl,SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END)::int wins,SUM(CASE WHEN pnl<0 THEN 1 ELSE 0 END)::int losses FROM trade_outcomes GROUP BY COALESCE(strategy_version,'baseline-unversioned') ORDER BY avg_pnl DESC NULLS LAST LIMIT 100`).catch(()=>({rows:[] as any[]}));
 const a=await db().query(`SELECT analyst_id,COUNT(*)::int outcomes,AVG(return_pct)::double precision avg_return,SUM(CASE WHEN outcome='WIN' THEN 1 ELSE 0 END)::int wins FROM analyst_memory WHERE kind='OUTCOME' AND outcome<>'OPEN' GROUP BY analyst_id ORDER BY avg_return DESC NULLS LAST LIMIT 100`).catch(()=>({rows:[] as any[]}));
 return {generatedAt:new Date().toISOString(),forecastOutcomes:q.rows,strategyOutcomes:s.rows,analysts:a.rows};
}
