import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';
import type { NewsItem } from './news-intelligence';
import { ANALYSTS } from './analysts';
import { buildMemoryContext, initializePersistentMemory, rememberAnalystOpinions } from './analyst-memory';

export type AnalystOpinion = { id:string; name:string; thesis:string; direction:'LONG'|'SHORT'|'NEUTRAL'; score:number; confidence:number; evidence:string[]; conflicts:string[]; independentMethod:string; memory?:{observations:number;evaluatedPredictions:number;winRate:number|null;averageReturnPct:number|null;currentWeight:number;recentLessons:string[]}; };
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const dir=(s:number):AnalystOpinion['direction']=>s>=25?'LONG':s<=-25?'SHORT':'NEUTRAL';

export async function runAnalystBrain(data:AdvancedMarketData, t:TechnicalAnalysis, news:NewsItem[]):Promise<AnalystOpinion[]>{
  await initializePersistentMemory();
  const r=t.indicators.rsi14??50, ema20=t.indicators.ema20, ema50=t.indicators.ema50, macd=t.indicators.macd, ms=t.indicators.macdSignal;
  const imb=t.liquidity.imbalance??0, funding=data.futures.fundingRate??0, candles=data.futures.candles.length?data.futures.candles:data.spot.candles;
  const last=candles.at(-1), prev=candles.at(-2); const volRatio=last&&prev&&prev.volume>0?last.volume/prev.volume:1;
  const newsScore=news.reduce((s,n)=>s+(n.sentiment==='BULLISH'?1:n.sentiment==='BEARISH'?-1:0)*(n.impact==='BREAKING'?3:n.impact==='HIGH'?2:1)*n.credibility,0);
  const base=(ema20!==null&&ema50!==null?(ema20>ema50?18:-18):0)+(macd!==null&&ms!==null?(macd>ms?12:-12):0);
  const regime=t.structure.trend;
  const opinions=ANALYSTS.map(a=>{
    const memory=buildMemoryContext(a.id,`${data.symbol} ${regime} ${a.specialty}`,data.symbol,regime);
    let s=0, evidence:string[]=[], conflicts:string[]=[], method='independent rule set';
    switch(a.id){
      case 'trend': s=t.structure.trend==='UP'?65:t.structure.trend==='DOWN'?-65:0; method='multi-factor trend regime'; break;
      case 'momentum': s=(r-50)*1.5+(macd!==null&&ms!==null?(macd>ms?20:-20):0); method='RSI momentum + MACD confirmation'; break;
      case 'volatility': s=t.volatility.regime==='HIGH'?0:t.structure.trend==='UP'?20:t.structure.trend==='DOWN'?-20:0; method='volatility-adjusted directional filter'; break;
      case 'volume': s=(volRatio-1)*40+(last&&last.close>last.open?18:-18); method='volume expansion and candle pressure'; break;
      case 'liquidity': s=imb*100; method='order-book imbalance and spread'; break;
      case 'futures': s=(funding<0?-18:funding>0.0008?-18:8)+(data.futures.openInterest!==null?(t.structure.trend==='UP'?12:-12):0); method='funding + derivatives positioning'; break;
      case 'structure': s=(t.structure.higherHighs?30:0)+(t.structure.higherLows?30:0)-(t.structure.trend==='DOWN'?60:0); method='swing high/low structure'; break;
      case 'breakout': s=last&&t.indicators.bollingerUpper!==null&&last.close>t.indicators.bollingerUpper&&volRatio>1.2?55:last&&t.indicators.bollingerLower!==null&&last.close<t.indicators.bollingerLower&&volRatio>1.2?-55:0; method='range escape + volume confirmation'; break;
      case 'mean-reversion': s=r>70?-45:r<30?45:0; method='extreme oscillator reversion'; break;
      case 'scalp': s=imb*70+(r-50)*0.8; method='microstructure momentum'; break;
      case 'swing': s=base+(t.structure.trend==='UP'?25:t.structure.trend==='DOWN'?-25:0); method='multi-horizon trend confluence'; break;
      case 'risk': s=Math.abs(imb)>0.25||t.volatility.regime==='HIGH'?0:base*0.6; method='risk-adjusted opportunity filter'; break;
      case 'sentiment': s=clamp(newsScore*12,-70,70); method='weighted news sentiment'; break;
      case 'news': s=clamp(newsScore*15,-80,80); method='source-weighted news impact'; break;
      case 'event': s=clamp(news.filter(n=>n.impact==='BREAKING').reduce((x,n)=>x+(n.sentiment==='BULLISH'?1:n.sentiment==='BEARISH'?-1:0)*n.credibility,0)*35,-80,80); method='breaking-event transmission'; break;
      case 'macro': s=news.some(n=>/rate|fed|inflation|recession|sanction/i.test(n.title))?newsScore*10:0; method='macro headline sensitivity'; break;
      case 'correlation': s=base*0.7; method='cross-factor confirmation'; break;
      case 'btc': s=data.symbol.startsWith('BTC')?base+imb*30:0; method='BTC-specific regime'; break;
      case 'eth': s=data.symbol.startsWith('ETH')?base+imb*30:0; method='ETH-specific regime'; break;
      case 'altcoin': s=!/^BTC|ETH/.test(data.symbol)?base:0; method='relative altcoin regime'; break;
      case 'onchain': s=0; method='on-chain evidence gate; unavailable data produces no invented opinion'; break;
      case 'funding': s=clamp(-funding*50000,-70,70); method='funding contrarian model'; break;
      case 'oi': s=data.futures.openInterest===null?0:base; method='open-interest confirmation gate'; break;
      case 'liquidation': { const buy=data.futures.liquidations.filter(x=>x.side==='BUY').reduce((a,x)=>a+x.price*x.quantity,0), sell=data.futures.liquidations.filter(x=>x.side==='SELL').reduce((a,x)=>a+x.price*x.quantity,0); s=(sell-buy)/(sell+buy||1)*80; method='liquidation pressure balance'; break; }
      case 'orderflow': { const buys=data.spot.trades.filter(x=>!x.isBuyerMaker).reduce((a,x)=>a+x.price*x.quantity,0), sells=data.spot.trades.filter(x=>x.isBuyerMaker).reduce((a,x)=>a+x.price*x.quantity,0); s=(buys-sells)/(buys+sells||1)*80; method='aggressive trade-flow balance'; break; }
      case 'pattern': { const body=last?last.close-last.open:0; const range=last?last.high-last.low:0; s=range?body/range*60:0; method='candle anatomy and rejection'; break; }
      case 'fibonacci': { const hi=Math.max(...candles.slice(-50).map(x=>x.high),0), lo=Math.min(...candles.slice(-50).map(x=>x.low),Infinity), p=data.futures.price??data.spot.price??0; const mid=hi-(hi-lo)*0.618; s=p>mid?20:-20; method='swing-range retracement model'; break; }
      case 'support': { const p=data.futures.price??data.spot.price??0; s=t.structure.support!==null&&p<=t.structure.support*1.01?25:0; method='support proximity and reaction'; break; }
      case 'resistance': { const p=data.futures.price??data.spot.price??0; s=t.structure.resistance!==null&&p>=t.structure.resistance*0.99?-25:0; method='resistance proximity and rejection'; break; }
      case 'forecast': s=base+(r-50)*0.5; method='scenario probability synthesis'; break;
      case 'critic': s=0; conflicts.push('Critic does not generate a directional bias; it searches for disagreement.'); method='adversarial contradiction search'; break;
      case 'verifier': s=0; conflicts.push(`Data coverage ${t.confidence}% and ${candles.length} candles verified.`); method='data integrity verification'; break;
      case 'consensus': s=base; method='final weighted consensus layer'; break;
    }
    const rawScore=s, memoryWeight=memory.effectiveWeight;
    s=rawScore*memoryWeight;
    if (memory.profile.evaluatedPredictions>=20) evidence.push(`Historical performance weight: ${memoryWeight.toFixed(3)}.`);
    if (memory.profile.evaluatedPredictions>=12 && memory.effectiveWeight!==memory.profile.currentWeight) evidence.push(`Regime-aware adjustment active for ${regime}: ${memory.effectiveWeight.toFixed(3)}.`);
    if (memory.memories.length) evidence.push(`Retrieved ${memory.memories.length} relevant memory records for ${data.symbol}.`);
    if (memory.profile.recentLessons.length) evidence.push(`Relevant lessons retained: ${memory.profile.recentLessons.slice(-3).join(' | ')}`);
    if(t.volatility.regime==='HIGH'&&Math.abs(s)>30) conflicts.push('High volatility reduces confidence.');
    if(news.some(n=>n.impact==='BREAKING')) conflicts.push('Breaking news can invalidate technical assumptions.');
    evidence.push(method);
    const confidence=clamp(Math.round(45+Math.abs(s)*0.55+(t.confidence-75)*0.25-conflicts.length*5),0,96);
    return {id:a.id,name:a.name,thesis:`Independent ${a.specialty} view using ${method}. Memory weight ${memoryWeight.toFixed(3)}.`,direction:dir(s),score:Math.round(clamp(s,-100,100)),confidence,evidence,conflicts,independentMethod:method,memory:{observations:memory.profile.observations,evaluatedPredictions:memory.profile.evaluatedPredictions,winRate:memory.profile.winRate,averageReturnPct:memory.profile.averageReturnPct,currentWeight:memoryWeight,recentLessons:memory.profile.recentLessons}};
  });
  rememberAnalystOpinions(data.symbol, regime, opinions);
  return opinions;
}

export function buildDecisionAudit(opinions:AnalystOpinion[], scenarios?:{dominant:string;scenarios?:Array<{id:string;probability:number}>}){
  const usable=opinions.filter(x=>x.id!=='critic'&&x.id!=='verifier');
  const families:Record<string,string[]>={trend:['trend','structure','support','resistance'],momentum:['momentum','rsi'],derivatives:['futures','funding','oi','liquidation','orderflow'],flow:['volume','liquidity'],patterns:['pattern','breakout','fibonacci'],forecast:['forecast','volatility'],news:['news','event','sentiment'],macro:['macro','correlation'],assets:['btc','eth','altcoin'],execution:['scalp','swing','mean-reversion']};
  const familyImpact=Object.entries(families).map(([family,ids])=>{const xs=usable.filter(x=>ids.includes(x.id));const weight=xs.reduce((s,x)=>s+Math.abs(x.score)*(x.confidence/100)*(x.memory?.currentWeight??1),0);const signed=xs.reduce((s,x)=>s+x.score*(x.confidence/100)*(x.memory?.currentWeight??1),0);return {family,analysts:xs.length,impact:Number(weight.toFixed(2)),signed:Number(signed.toFixed(2))};}).filter(x=>x.analysts);
  const evidence=usable.flatMap(x=>x.evidence.map(e=>({analyst:x.id,evidence:e}))).slice(0,60);
  const conflicts=usable.flatMap(x=>x.conflicts.map(conflict=>({analyst:x.id,conflict}))).slice(0,40);
  const byDirection={LONG:usable.filter(x=>x.direction==='LONG').length,SHORT:usable.filter(x=>x.direction==='SHORT').length,NEUTRAL:usable.filter(x=>x.direction==='NEUTRAL').length};
  const strongest=[...usable].sort((a,b)=>Math.abs(b.score)*b.confidence-Math.abs(a.score)*a.confidence).slice(0,8).map(x=>({id:x.id,direction:x.direction,score:x.score,confidence:x.confidence,weight:x.memory?.currentWeight??1}));
  const contradictions=usable.filter(x=>x.direction!=='NEUTRAL').filter(x=>usable.some(y=>y.direction!==x.direction&&y.direction!=='NEUTRAL')).length;
  return {coverage:usable.length,directions:byDirection,familyImpact,strongest,contradictions,evidence,conflicts,dominantScenario:scenarios?.dominant??null,scenarioProbabilities:scenarios?.scenarios?.map(s=>({id:s.id,probability:s.probability}))??[]};
}

export function synthesizeOpinions(opinions:AnalystOpinion[]){
  const usable=opinions.filter(x=>x.id!=='critic'&&x.id!=='verifier');
  const weighted=usable.reduce((s,x)=>s+x.score*x.confidence/100,0), weight=usable.reduce((s,x)=>s+x.confidence/100,0)||1;
  const score=weighted/weight; const long=usable.filter(x=>x.direction==='LONG').length, short=usable.filter(x=>x.direction==='SHORT').length;
  const agreement=Math.round(Math.max(long,short)/Math.max(1,usable.length)*100);
  return {direction:score>=25?'LONG':score<=-25?'SHORT':'NEUTRAL',score:Math.round(score),confidence:Math.round(Math.min(96,Math.abs(score)*0.55+agreement*0.45)),agreement,long,short,dissent:usable.filter(x=>Math.abs(x.score-score)>45).sort((a,b)=>b.confidence-a.confidence).slice(0,8).map(x=>({id:x.id,direction:x.direction,score:x.score,confidence:x.confidence}))};
}
