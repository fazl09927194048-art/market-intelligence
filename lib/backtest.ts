import type { AdvancedMarketData, Candle } from './market-advanced';
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

function backtestData(candles: Candle[], index: number): AdvancedMarketData {
  const history = candles.slice(0, index + 1);
  const price = candles[index]?.close ?? null;
  return {
    symbol: 'BACKTEST',
    fetchedAt: new Date(candles[index]?.openTime ?? Date.now()).toISOString(),
    spot: { price, candles: history, orderBook: { bids: [], asks: [], lastUpdateId: null }, trades: [] },
    futures: { price, candles: history, fundingRate: null, fundingTime: null, openInterest: null, openInterestTime: null, liquidations: [] },
    sourceHealth: {},
    warnings: [],
  };
}

export function runBacktest(candles: Candle[], lookahead = 12): BacktestResult {
  const clean = candles
    .filter(c => Number.isFinite(c.openTime) && Number.isFinite(c.close) && c.close > 0 && c.high >= c.low)
    .sort((a, b) => a.openTime - b.openTime);
  const horizon = Math.max(2, Math.min(48, Math.floor(lookahead)));
  const trades: BacktestTrade[] = [];
  let skipped = 0;

  for (let i = 60; i < clean.length - horizon; i += 1) {
    const history = clean.slice(0, i + 1);
    const technical = analyzeTechnical(history, [], []);
    const signal = buildSignal(backtestData(clean, i), technical);
    if (signal.signal !== 'LONG' && signal.signal !== 'SHORT') {
      skipped += 1;
      continue;
    }
    const future = clean.slice(i + 1, i + 1 + horizon).map(c => c.close);
    const evaluation = evaluateSignal(signal, future);
    trades.push({
      index: i,
      entryTime: clean[i].openTime,
      entry: clean[i].close,
      exit: future.at(-1) ?? null,
      side: signal.signal,
      outcome: evaluation.outcome,
      returnPct: evaluation.realizedReturnPct,
    });
  }

  const closed = trades.filter(t => t.returnPct !== null);
  const wins = closed.filter(t => t.outcome === 'WIN').length;
  const losses = closed.filter(t => t.outcome === 'LOSS').length;
  const returns = closed.map(t => t.returnPct as number);
  let equity = 0;
  let peak = 0;
  let maxDrawdownPct = 0;
  for (const r of returns) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak - equity);
  }
  const grossProfit = returns.filter(r => r > 0).reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(returns.filter(r => r < 0).reduce((s, r) => s + r, 0));
  const netReturnPct = returns.reduce((s, r) => s + r, 0);

  return {
    trades,
    evaluated: closed.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length : null,
    netReturnPct,
    averageReturnPct: closed.length ? netReturnPct / closed.length : null,
    maxDrawdownPct,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : null,
    skipped,
  };
}
