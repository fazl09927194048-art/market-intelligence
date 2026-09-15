const baseUrl = (process.env.MARKET_INTEL_URL || '').replace(/\/$/, '');
const token = process.env.FORECAST_EVALUATION_TOKEN || '';
if (!baseUrl || !token) throw new Error('MARKET_INTEL_URL and FORECAST_EVALUATION_TOKEN are required');
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(`${baseUrl}/api/forecast-evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 50 }),
    signal: controller.signal,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`forecast-evaluate failed (${response.status}): ${text.slice(0, 500)}`);
  const result = JSON.parse(text);
  console.log(JSON.stringify({
    ok: true,
    evaluated: result.evaluated ?? 0,
    persisted: result.persisted ?? 0,
  }));
} finally {
  clearTimeout(timer);
}
