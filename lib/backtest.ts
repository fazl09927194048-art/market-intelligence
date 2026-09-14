import type { Candle } from './market-advanced';
import { analyzeTechnical } from './technical';
import { buildSignal } from './signal';
import { evaluateSignal, type SignalEvaluation } from './learning';

export type BacktestTrade = {
  index: number;
  entryTime: number;
  entry: number;
  exit: number | null;
  side: 'LONG' | 'SHORT';
  outcome: SignalEvaluation['outcome'];
  returnPct: number | null;
};

export type BacktestResult = {
  trades: BacktestTrade[];
  evaluated: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netReturnPct: number;
  averageReturnPct: number | null;
  maxDrawdownPct: number;
  profitFactor: number | null;
  skipped: number;
};

export function runBacktest(candles: Candle[], lookahead = 12): BacktestResult {
  const trades: BacktestTrade[] = [];
  let skipped = 0;
  for (let i = 60; i < candles.length - lookahead; i += 1) {
    const history = candles.slice(0, i + 1);
    const technical = analyzeTechnical(history, [], []);
    const data = {
      symbol: 'BACKTEST', fetchedAt: new Date(candles[i].time).toISOString(),
      spot: { price: candles[i].close, candles: history, orderBook:{ bids:[], asks:[] }, trades:[], sourceHealth:{} },
      futures: { price: candles[i].close, candles: history, fundingRate:null, fundingTime:null, openInterest:null, openInterestTime:null, liquidations:[], sourceHealth:{} },
      warnings:[], sourceHealth:{}
    } as Parameters<typeof buildSignal>[0];
    const signal = buildSignal(data, technical);
    if (signal.signal !== 'LONG' && signal.signal !== 'SHORT') { skipped += 1; continue; }
    const future = candles.slice(i + 1, i + 1 + lookahead).map(c => c.close);
    const evaluation = evaluateSignal(signal, future);
    trades.push({ index:i, entryTime:candles[i].time, entry:candles[i].close, exit:future.at(-1) ?? null, side:signal.signal, outcome:evaluation.outcome, returnPct:evaluation.realizedReturnPct });
  }
  const closed = trades.filter(t => t.returnPct !== null);
  const wins = closed.filter(t => t.outcome === 'WIN').length;
  const losses = closed.filter(t => t.outcome === 'LOSS').length;
  const returns = closed.map(t => t.returnPct as number);
  let equity = 0; let peak = 0; let maxDrawdownPct = 0;
  for (const r of returns) { equity += r; peak = Math.max(peak, equity); maxDrawdownPct = Math.max(maxDrawdownPct, peak - equity); }
  const grossProfit = returns.filter(r => r > 0).reduce((s,r) => s+r,0);
  const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((s,r) => s+r,0));
  return { trades, evaluated:closed.length, wins, losses, winRate:closed.length ? wins/closed.length : null, netReturnPct:returns.reduce((s,r)=>s+r,0), averageReturnPct:closed.length ? returns.reduce((s,r)=>s+r,0)/closed.length : null, maxDrawdownPct, profitFactor:grossLoss ? grossProfit/grossLoss : grossProfit ? Infinity : null, skipped };
}
