import { getAdvancedMarketData } from './market-advanced';
import { evaluateForecast, type ForecastEvaluation } from './forecast-evaluation';
import { persistForecastSnapshot, getDueForecastSnapshots } from './persistent-memory';

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
      const data = await getAdvancedMarketData(snapshot.symbol, snapshot.interval, 50);
      const price = data.futures.price ?? data.spot.price;
      if (price === null || !Number.isFinite(price) || price <= 0) continue;
      results.push(evaluateForecast({ ...snapshot, endPrice: price }));
    } catch {
      // One unavailable symbol/source must not block the remaining batch.
    }
  }
  return results;
}
