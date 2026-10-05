import {evaluateDueForecasts} from './forecast-snapshots';
import {recordForecastEvaluation} from './forecast-evaluation';
import {db,ensureExchangeSchema} from './exchange/db';

export async function runLearningCycle(limit=25){
 const evaluations=await evaluateDueForecasts(limit);
 let persisted=0;
 for(const e of evaluations){if(await recordForecastEvaluation(e))persisted++;}
 let analystOutcomes=0;
 try{
  await ensureExchangeSchema();
  const r=await db().query(`SELECT COUNT(*)::int AS count FROM trade_outcomes WHERE created_at >= now()-interval '7 days'`);
  analystOutcomes=Number(r.rows[0]?.count||0);
 }catch{}
 return {evaluatedForecasts:evaluations.length,persistedForecasts:persisted,recentTradeOutcomes:analystOutcomes,ranAt:new Date().toISOString()};
}
