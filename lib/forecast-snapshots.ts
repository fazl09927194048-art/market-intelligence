import { getAdvancedMarketData } from './market-advanced';
import { evaluateForecast, type ForecastEvaluation } from './forecast-evaluation';
import { persistForecastSnapshot, getDueForecastSnapshots, releaseForecastClaim } from './persistent-memory';

export type ForecastSnapshot = {
  id: string;
  symbol: string;
  interval: string;
  forecastAt: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  confidence: number;
  startPrice: number;
  expectedLow: number | null;
  expectedHigh: number | null;
  horizonMs: number;
  cycleId: string;
};

export async function recordForecastSnapshot(snapshot: ForecastSnapshot) {
  return persistForecastSnapshot(snapshot);
}

export async function evaluateDueForecasts(limit = 50): Promise<ForecastEvaluation[]> {
  const due = await getDueForecastSnapshots(limit);
  const results: ForecastEvaluation[] = [];
  for (const snapshot of due) {
    try {
      const data = await getAdvancedMarketData(snapshot.symbol, snapshot.interval, 500);
      const price = data.futures.price ?? data.spot.price;
      if (price === null || !Number.isFinite(price) || price <= 0) {
        await releaseForecastClaim(snapshot.id);
        continue;
      }
      const forecastAtMs=Date.parse(snapshot.forecastAt);
      const path=(data.futures.candles.length?data.futures.candles:data.spot.candles)
        .filter(c=>c.openTime>=forecastAtMs&&c.openTime<=forecastAtMs+snapshot.horizonMs)
        .map(c=>({openTime:c.openTime,high:c.high,low:c.low,closeTime:c.closeTime}));
      results.push(evaluateForecast({ ...snapshot, endPrice: price, path }));
    } catch {
      await releaseForecastClaim(snapshot.id);
      // One unavailable symbol/source must not block the remaining batch.
    }
  }
  return results;
}
