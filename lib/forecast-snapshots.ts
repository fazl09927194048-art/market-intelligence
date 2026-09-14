import { getAdvancedMarketData } from './market-advanced';
import { evaluateForecast, type ForecastEvaluation } from './forecast-evaluation';
import { persistForecastSnapshot, getDueForecastSnapshots } from './persistent-memory';
export type ForecastSnapshot={id:string;symbol:string;interval:string;forecastAt:string;bias:'BULLISH'|'BEARISH'|'NEUTRAL'|'UNAVAILABLE';confidence:number;startPrice:number;expectedLow:number|null;expectedHigh:number|null;horizonMs:number;cycleId:string};
export async function recordForecastSnapshot(snapshot:ForecastSnapshot){return persistForecastSnapshot(snapshot);}
export async function evaluateDueForecasts(limit=50):Promise<ForecastEvaluation[]>{const due=await getDueForecastSnapshots(limit);const results:ForecastEvaluation[]=[];for(const s of due){try{const data=await getAdvancedMarketData(s.symbol,s.interval,50);const price=data.futures.price??data.spot.price;if(!Number.isFinite(price)||price<=0)continue;results.push(evaluateForecast({...s,endPrice:price}));}catch{/* individual evaluation must not block the batch */}}return results;}
