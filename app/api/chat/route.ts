import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData, type AdvancedMarketData } from '@/lib/market-advanced';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';

export const dynamic = 'force-dynamic';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || (MODEL === 'gpt-5.6-luna' ? 'gpt-5.6-terra' : 'gpt-5.6-luna');
const inFlight = new Map<string, Promise<{ status: number; body: any }>>();
const liveCache = new Map<string, { at: number; data: AdvancedMarketData }>();
const LIVE_TTL = 3000;

function safeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}
function jsonError(message: string, status: number, detail?: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, detail: detail?.slice(0, 700), ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function retryDelay(response: Response) {
  const h = Number(response.headers.get('retry-after'));
  if (Number.isFinite(h) && h >= 0) return Math.min(5000, Math.max(500, h * 1000));
  return 1500 + Math.floor(Math.random() * 500);
}

async function extractChartVision(apiKey:string, model:string, imageData:string): Promise<ChartVisionContext|null> {
  const prompt='Analyze this trading chart image only. Do not invent unreadable values. Return ONLY valid JSON with keys direction (BULLISH|BEARISH|NEUTRAL|UNKNOWN), confidence (0-100), trend, support (number[]), resistance (number[]), patterns (string[]), invalidation (string|null), evidence (string[]).';
  const result=await callProvider(apiKey,model,prompt,imageData);
  if(!result.ok||!result.text)return null;
  try{const match=result.text.match(/\\{[\\s\\S]*\\}/);if(!match)return null;const v=JSON.parse(match[0]);return {direction:v.direction,confidence:Number(v.confidence),trend:String(v.trend||''),support:Array.isArray(v.support)?v.support.map(Number).filter(Number.isFinite).slice(0,6):[],resistance:Array.isArray(v.resistance)?v.resistance.map(Number).filter(Number.isFinite).slice(0,6):[],patterns:Array.isArray(v.patterns)?v.patterns.map(String).slice(0,8):[],invalidation:v.invalidation?String(v.invalidation):null,evidence:Array.isArray(v.evidence)?v.evidence.map(String).slice(0,8):[]};}catch{return null;}
}
async function callProvider(apiKey: string, model: string, prompt: string, imageData?: string) {
  let detail = '', status = 502;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: imageData ? [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: imageData }] }] : prompt, max_output_tokens: 1400 }),
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      detail = e instanceof Error ? e.message : 'Network error';
      if (attempt === 0) { await new Promise(r => setTimeout(r, 350)); continue; }
      return { ok: false, status: 502, detail };
    }
    if (response.ok) {
      const data = await response.json();
      const text = typeof data?.output_text === 'string'
        ? data.output_text.trim()
        : (Array.isArray(data?.output)
          ? data.output.flatMap((x: any) => Array.isArray(x?.content) ? x.content : []).map((x: any) => x?.text ?? '').filter(Boolean).join('\n').trim()
          : '');
      return text ? { ok: true, status: 200, text, model } : { ok: false, status: 502, detail: 'AI provider returned no text.' };
    }
    status = response.status;
    detail = await response.text();
    if (![429, 500, 502, 503, 504].includes(status) || attempt === 1) break;
    await new Promise(r => setTimeout(r, retryDelay(response)));
  }
  return { ok: false, status, detail };
}

async function getLive(symbol: string, interval: string) {
  const key = `${symbol}:${interval}`;
  const cached = liveCache.get(key);
  if (cached && Date.now() - cached.at < LIVE_TTL) return cached.data;
  const data = await getAdvancedMarketData(symbol, interval, 80);
  liveCache.set(key, { at: Date.now(), data });
  if (liveCache.size > 40) {
    const oldest = [...liveCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) liveCache.delete(oldest[0]);
  }
  return data;
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'DRO AI chat', configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL, fallbackConfigured: Boolean(process.env.OPENAI_FALLBACK_MODEL), fallbackModel: FALLBACK_MODEL, timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const guard = consumeRateLimit(request, 'ai-chat', 12);
  if (!guard.allowed) return jsonError('Too many AI requests. Please retry shortly.', 429, undefined, { retryAfterMs: guard.retryAfter * 1000 });
  if (tooLarge(request, 2_500_000)) return jsonError('Request payload is too large. Compress the chart image and retry.', 413);
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError('AI chat is not configured on the server.', 503);
    let body: any;
    try { body = await request.json(); } catch { return jsonError('Invalid JSON request.', 400); }

    const message = safeText(body?.message, 7000).trim();
    const context = safeText(body?.context, 16000);
    const extensionContext = safeText(body?.extensionContext, 12000);
    const extensionEnabled = body?.extensionEnabled === true;
    const toolContext = body?.toolContext || {};
    const imageData = typeof body?.imageData === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.imageData) ? body.imageData : '';
    const imageAttached = Boolean(imageData);
    if (!message && !imageData) return jsonError('Message or chart image is required.', 400);

    const symbol = safeText(body?.symbol || context.match(/\"symbol\"\s*:\s*\"([A-Z0-9]+)\"/)?.[1] || 'BTCUSDT', 20);
    const interval = safeText(body?.interval || context.match(/\"interval\"\s*:\s*\"([A-Za-z0-9]+)\"/)?.[1] || '15m', 10);

    let chartData: any = null;
    try {
      const live = await getLive(symbol, interval);
      const candles = (live.futures.candles.length ? live.futures.candles : live.spot.candles).slice(-50);
      chartData = {
        symbol,
        interval,
        fetchedAt: live.fetchedAt,
        spotPrice: live.spot.price,
        futuresPrice: live.futures.price,
        candles,
        microstructure: live.microstructure,
        derivatives: live.derivatives,
        fundingRate: live.futures.fundingRate,
        openInterest: live.futures.openInterest,
        sourceHealth: live.sourceHealth,
        warnings: live.warnings,
        dataQuality: live.warnings.length ? 'degraded' : 'live',
      };
    } catch {
      chartData = { symbol, interval, dataQuality: 'unavailable' };
    }

    let chartVision: ChartVisionContext|null = null;
    if (imageAttached) chartVision = await extractChartVision(apiKey, MODEL, imageData);
    let centralIntelligence:any = null;
    try { centralIntelligence = await runIntelligenceCycle(symbol, interval, null, chartVision); } catch { centralIntelligence = null; }

    const prompt = `You are DRO, the final market decision layer. Analyze any attached trading chart image for visible price action, structure, indicators and annotations without inventing unreadable values. Combine image evidence with live market data and the 33-specialist intelligence context. If evidence conflicts or quality is weak, use NO TRADE. Never guarantee profit. Return a concise explanation followed by exactly one line beginning FINAL_TRADE_PLAN_JSON: with valid JSON keys signal (LONG|SHORT|NO TRADE), confidence (0-100), entry, stopLoss, takeProfit, rr, maxOpenMinutes, closeBy (ISO timestamp or null), invalidation, reason. For LONG/SHORT, entry/SL/TP must be numeric; for NO TRADE they may be null. maxOpenMinutes is a maximum planned holding time, not a guarantee.\n\nLIVE CORE CONTEXT:\n${context}\n\nCENTRAL IMAGE-AWARE INTELLIGENCE ENGINE:\n${JSON.stringify(centralIntelligence)}\n\nEXTRACTED CHART VISION:\n${JSON.stringify(chartVision)}\n\nDRO TOOL STATE:\n${JSON.stringify(toolContext)}\n\nCHART IMAGE ATTACHED: ${imageAttached ? 'YES — inspect it carefully' : 'NO'}\n\nLIVE MARKET/CHART DATA:\n${JSON.stringify(chartData)}\n\nBROWSER EXTENSION (${extensionEnabled ? 'ACTIVE' : 'OFF'}):\n${extensionEnabled ? extensionContext || 'No fresh extension snapshot.' : 'Ignore extension data.'}\n\nUSER:\n${message}`;

    const key = `${MODEL}|${extensionEnabled ? extensionContext : ''}|${context}|${JSON.stringify(chartData)}|${imageData.slice(0, 64)}|${message}`.slice(0, 50000);
    const existing = inFlight.get(key);
    if (existing) {
      const result = await existing;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    }

    const work = (async () => {
      let result = await callProvider(apiKey, MODEL, prompt, imageData);
      const transientFailure = [429, 500, 502, 503, 504].includes(result.status);
      if (!result.ok && transientFailure && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
        result = await callProvider(apiKey, FALLBACK_MODEL, prompt, imageData);
      }
      if (!result.ok) {
        const rate = result.status === 429;
        return {
          status: rate ? 429 : result.status >= 500 ? 502 : result.status,
          body: {
            ok: false,
            error: rate ? 'AI provider is temporarily rate-limited or quota-limited. DRO live market data remains available; please retry shortly.' : `AI provider error (${result.status}).`,
            detail: result.detail?.slice(0, 500),
            retryable: rate || result.status >= 500,
            retryAfterMs: rate ? 2500 : 0,
          },
        };
      }
      return { status: 200, body: (() => { const match = result.text.match(/FINAL_TRADE_PLAN_JSON:\s*(\{.*\})/s); let tradePlan: any = null; if (match) { try { tradePlan = JSON.parse(match[1]); } catch {} } if (tradePlan && (tradePlan.signal === 'LONG' || tradePlan.signal === 'SHORT')) { const raw = Number(tradePlan.maxOpenMinutes); const fallback = interval.endsWith('m') ? Math.max(15, (Number.parseInt(interval,10)||15)*8) : interval.endsWith('h') ? Math.max(60, (Number.parseInt(interval,10)||1)*8*60) : 480; const maxOpenMinutes = Number.isFinite(raw) && raw > 0 ? Math.min(10080, Math.round(raw)) : fallback; tradePlan.maxOpenMinutes = maxOpenMinutes; tradePlan.closeBy = new Date(Date.now() + maxOpenMinutes*60000).toISOString(); tradePlan.entry = Number.isFinite(Number(tradePlan.entry)) ? Number(tradePlan.entry) : null; tradePlan.stopLoss = Number.isFinite(Number(tradePlan.stopLoss)) ? Number(tradePlan.stopLoss) : null; tradePlan.takeProfit = Number.isFinite(Number(tradePlan.takeProfit)) ? Number(tradePlan.takeProfit) : null; tradePlan.rr = Number.isFinite(Number(tradePlan.rr)) ? Number(tradePlan.rr) : null; const validGeometry = tradePlan.entry !== null && tradePlan.stopLoss !== null && tradePlan.takeProfit !== null && (tradePlan.signal === 'LONG' ? tradePlan.stopLoss < tradePlan.entry && tradePlan.takeProfit > tradePlan.entry : tradePlan.stopLoss > tradePlan.entry && tradePlan.takeProfit < tradePlan.entry); if (!validGeometry) { tradePlan.signal='NO TRADE'; tradePlan.confidence=Math.min(35, Math.max(0, Number(tradePlan.confidence)||0)); tradePlan.entry=null; tradePlan.stopLoss=null; tradePlan.takeProfit=null; tradePlan.rr=null; tradePlan.closeBy=null; tradePlan.invalidation='Invalid trade-plan geometry; entry/stop/target relationship failed validation.'; tradePlan.reason='NO TRADE: the proposed risk levels are internally inconsistent.'; } } else if (tradePlan) { tradePlan.signal='NO TRADE'; tradePlan.confidence=Math.min(100, Math.max(0, Number(tradePlan.confidence)||0)); tradePlan.entry=null; tradePlan.stopLoss=null; tradePlan.takeProfit=null; tradePlan.rr=null; tradePlan.closeBy=null; } if (tradePlan) tradePlan.confidence=Math.min(100, Math.max(0, Number(tradePlan.confidence)||0)); return { ok: true, text: result.text.replace(/\n?FINAL_TRADE_PLAN_JSON:\s*\{.*\}\s*$/s, '').trim(), tradePlan, imageAttached, model: result.model, extensionEnabled, chartEnabled: Boolean(toolContext.chart), generatedAt: new Date().toISOString() }; })() };
    })();
    inFlight.set(key, work);
    try {
      const result = await work;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store', ...(result.status === 429 ? { 'Retry-After': '3' } : {}) } });
    } finally {
      inFlight.delete(key);
    }
  } catch (e) {
    return jsonError('AI chat failed unexpectedly. Please retry.', 500, e instanceof Error ? e.message : 'unknown error');
  }
}
