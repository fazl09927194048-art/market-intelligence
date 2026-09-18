import type { AdvancedMarketData } from './market-advanced';
import type { TechnicalAnalysis } from './technical';

export type SignalSide = 'LONG' | 'SHORT' | 'NEUTRAL' | 'NO TRADE';

export type SignalResult = {
  signal: SignalSide;
  score: number;
  confidence: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  riskReward: number | null;
  regime: TechnicalAnalysis['structure']['trend'];
  invalidation: string;
  evidence: string[];
  conflicts: string[];
  dataFresh: boolean;
  generatedAt: string;
};

export type ForecastResult = {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  horizon: string;
  confidence: number;
  expectedLow: number | null;
  expectedHigh: number | null;
  evidence: string[];
  risks: string[];
  invalidation: string;
};

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function freshness(data: AdvancedMarketData): { fresh: boolean; ageMs: number | null } {
  if (data.symbol === 'BACKTEST') return { fresh: true, ageMs: 0 };
  const fetched = Date.parse(data.fetchedAt);
  if (!Number.isFinite(fetched)) return { fresh: false, ageMs: null };
  const ageMs = Math.max(0, Date.now() - fetched);
  const candleClose = data.futures.candles.at(-1)?.closeTime ?? data.spot.candles.at(-1)?.closeTime ?? null;
  const candleAge = finite(candleClose) ? Math.max(0, Date.now() - candleClose) : null;
  const effectiveAge = candleAge === null ? ageMs : Math.max(ageMs, candleAge);
  return { fresh: effectiveAge <= 120_000, ageMs: effectiveAge };
}

export function buildSignal(data: AdvancedMarketData, technical: TechnicalAnalysis): SignalResult {
  const price = data.futures.price ?? data.spot.price;
  const atr = technical.indicators.atr14;
  const rsi = technical.indicators.rsi14;
  const ema20 = technical.indicators.ema20;
  const ema50 = technical.indicators.ema50;
  const macd = technical.indicators.macd;
  const macdSignal = technical.indicators.macdSignal;
  const imbalance = technical.liquidity.imbalance;
  const funding = data.futures.fundingRate;
  const oi = data.futures.openInterest;
  const freshnessState = freshness(data);
  const sourceDown = Object.values(data.sourceHealth).filter(v => v === 'down').length;
  const usable = finite(price) && finite(atr) && technical.confidence >= 75 && data.spot.candles.length >= 20 && freshnessState.fresh;
  const evidence: string[] = [];
  const conflicts: string[] = [];

  if (!freshnessState.fresh && data.symbol !== 'BACKTEST') conflicts.push('Market snapshot is stale; directional output is blocked until fresh data arrives.');
  if (sourceDown > 0) conflicts.push(`${sourceDown} market data source(s) are unavailable.`);
  if (!usable) {
    return { signal:'NO TRADE', score:0, confidence:0, entry:price ?? null, stopLoss:null, takeProfits:[], riskReward:null, regime:technical.structure.trend, invalidation:'Wait for sufficient, fresh and internally consistent market data.', evidence, conflicts: conflicts.length ? conflicts : ['Insufficient technical coverage or market data.'], dataFresh:freshnessState.fresh, generatedAt:new Date().toISOString() };
  }

  let score = 0;
  if (finite(ema20) && finite(ema50)) { if (ema20 > ema50) { score += 22; evidence.push('EMA20 is above EMA50.'); } else { score -= 22; evidence.push('EMA20 is below EMA50.'); } }
  if (finite(rsi)) { if (rsi >= 55 && rsi <= 72) { score += 14; evidence.push(`RSI14 supports bullish momentum (${rsi.toFixed(1)}).`); } else if (rsi <= 45 && rsi >= 28) { score -= 14; evidence.push(`RSI14 supports bearish momentum (${rsi.toFixed(1)}).`); } else if (rsi > 72) conflicts.push('RSI is overbought; long entries have elevated pullback risk.'); else if (rsi < 28) conflicts.push('RSI is oversold; short entries have elevated rebound risk.'); }
  if (finite(macd) && finite(macdSignal)) { if (macd > macdSignal) { score += 15; evidence.push('MACD is above its signal line.'); } else { score -= 15; evidence.push('MACD is below its signal line.'); } }
  if (finite(imbalance)) { if (imbalance > 0.12) { score += 16; evidence.push(`Order-book imbalance favors bids (${imbalance.toFixed(2)}).`); } else if (imbalance < -0.12) { score -= 16; evidence.push(`Order-book imbalance favors asks (${imbalance.toFixed(2)}).`); } }
  if (finite(funding)) { if (funding > 0.0008) { score -= 6; conflicts.push('Funding is elevated, reducing long setup quality.'); } else if (funding < -0.0008) { score += 6; evidence.push('Negative funding provides a modest contrarian bullish input.'); } }
  if (oi !== null) evidence.push('Open interest is available for derivatives context.');
  if (technical.divergence === 'BULLISH') { score += 8; evidence.push('Bullish RSI divergence detected.'); }
  if (technical.divergence === 'BEARISH') { score -= 8; evidence.push('Bearish RSI divergence detected.'); }
  if (technical.volatility.regime === 'HIGH') { conflicts.push('High volatility increases stop-out risk.'); score = Math.round(score * 0.85); }
  if (technical.structure.trend === 'SIDEWAYS') { conflicts.push('Market structure is sideways.'); score = Math.round(score * 0.65); }

  const side: SignalSide = score >= 55 ? 'LONG' : score <= -55 ? 'SHORT' : Math.abs(score) >= 30 ? 'NEUTRAL' : 'NO TRADE';
  const conflictPenalty = Math.min(25, conflicts.length * 6);
  const confidence = clamp(Math.round(Math.abs(score) * 0.9 + technical.confidence * 0.1 - conflictPenalty), 0, 95);
  if (side === 'NO TRADE') return { signal:side, score, confidence, entry:price, stopLoss:null, takeProfits:[], riskReward:null, regime:technical.structure.trend, invalidation:'A directional setup requires stronger confluence.', evidence, conflicts, dataFresh:true, generatedAt:new Date().toISOString() };
  if (side === 'NEUTRAL') return { signal:side, score, confidence, entry:price, stopLoss:null, takeProfits:[], riskReward:null, regime:technical.structure.trend, invalidation:'Breakout with confirmation above resistance or below support.', evidence, conflicts, dataFresh:true, generatedAt:new Date().toISOString() };

  const risk = atr * 1.25;
  const stopLoss = side === 'LONG' ? price - risk : price + risk;
  const tp1 = side === 'LONG' ? price + risk * 1.5 : price - risk * 1.5;
  const tp2 = side === 'LONG' ? price + risk * 2.5 : price - risk * 2.5;
  const riskReward = 1.5;
  return { signal:side, score, confidence, entry:price, stopLoss, takeProfits:[tp1,tp2], riskReward, regime:technical.structure.trend, invalidation:side==='LONG'?'Close below the stop/invalidation level or clear bearish structure shift.':'Close above the stop/invalidation level or clear bullish structure shift.', evidence, conflicts, dataFresh:true, generatedAt:new Date().toISOString() };
}

export function buildForecast(data: AdvancedMarketData, technical: TechnicalAnalysis): ForecastResult {
  const price = data.futures.price ?? data.spot.price;
  const atr = technical.indicators.atr14;
  const freshnessState = freshness(data);
  if (!finite(price) || !finite(atr) || technical.confidence < 75 || !freshnessState.fresh) return { bias:'UNAVAILABLE', horizon:'next 4-12 candles', confidence:0, expectedLow:null, expectedHigh:null, evidence:[], risks:['Insufficient or stale validated data.'], invalidation:'Obtain a fresh technical snapshot with adequate candle history.' };
  const bullish = technical.structure.trend === 'UP' && (technical.indicators.rsi14 ?? 50) >= 50;
  const bearish = technical.structure.trend === 'DOWN' && (technical.indicators.rsi14 ?? 50) <= 50;
  const bias = bullish ? 'BULLISH' : bearish ? 'BEARISH' : 'NEUTRAL';
  const multiplier = technical.volatility.regime === 'HIGH' ? 2.5 : 1.8;
  return { bias, horizon:'next 4-12 candles', confidence:clamp(Math.round(technical.confidence * 0.8 + Math.abs((technical.indicators.rsi14 ?? 50)-50)*0.3),0,90), expectedLow:price-atr*multiplier, expectedHigh:price+atr*multiplier, evidence:[`Trend: ${technical.structure.trend}.`,`Volatility regime: ${technical.volatility.regime}.`,`RSI14: ${technical.indicators.rsi14?.toFixed(1) ?? 'n/a'}.`], risks:['Forecast range is scenario-based, not a guaranteed price target.','Sudden news or liquidity changes can invalidate the setup.'], invalidation:'A confirmed structure reversal invalidates the directional bias.' };
}

export type ChartVisionContext = {
  direction?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
  confidence?: number;
  trend?: string;
  support?: number[];
  resistance?: number[];
  patterns?: string[];
  invalidation?: string | null;
  evidence?: string[];
};

export function applyChartVision(signal: SignalResult, vision?: ChartVisionContext | null): SignalResult {
  if (!vision || vision.direction === 'UNKNOWN' || !Number.isFinite(Number(vision.confidence))) return signal;
  const vc = clamp(Number(vision.confidence), 0, 100);
  if (vc < 55) return {...signal, conflicts:[...signal.conflicts,'Chart-image evidence confidence is below the integration threshold.']};
  const dir = vision.direction === 'BULLISH' ? 'LONG' : vision.direction === 'BEARISH' ? 'SHORT' : 'NEUTRAL';
  const evidence = [...signal.evidence, ...(vision.evidence ?? []).slice(0,4).map(x=>'Chart vision: '+x)];
  if (dir === signal.signal) return {...signal, confidence:clamp(Math.round(signal.confidence*0.7+vc*0.3),0,95), evidence, invalidation:vision.invalidation || signal.invalidation};
  if ((signal.signal === 'LONG' || signal.signal === 'SHORT') && (dir === 'LONG' || dir === 'SHORT')) return {...signal, signal:'NO TRADE', confidence:Math.min(signal.confidence,Math.round(vc*0.6)), entry:signal.entry, stopLoss:null, takeProfits:[], riskReward:null, conflicts:[...signal.conflicts,'Chart-image direction conflicts with the live deterministic signal.'], evidence, invalidation:vision.invalidation || 'Wait for price action and chart evidence to realign.'};
  return {...signal, confidence:Math.min(signal.confidence,Math.round(vc*0.75)), evidence, conflicts:[...signal.conflicts,'Chart-image context is not directional enough for confirmation.']};
}
