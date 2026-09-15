import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || '';
const inFlight = new Map<string, Promise<{ status: number; body: any }>>();

function safeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function jsonError(message: string, status: number, detail?: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, detail: detail?.slice(0, 700), ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function retryDelay(response: Response, attempt: number) {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header >= 0) return Math.min(8000, Math.max(250, header * 1000));
  return Math.min(8000, 700 * 2 ** attempt + Math.floor(Math.random() * 250));
}

async function callProvider(apiKey: string, model: string, prompt: string) {
  let lastDetail = '';
  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: prompt, max_output_tokens: 1200 }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : 'Network error';
      if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
      return { ok: false, status: 502, detail: lastDetail };
    }
    if (response.ok) {
      const data = await response.json();
      const text = typeof data?.output_text === 'string'
        ? data.output_text.trim()
        : (Array.isArray(data?.output) ? data.output.flatMap((x: any) => Array.isArray(x?.content) ? x.content : []).map((x: any) => x?.text ?? '').filter(Boolean).join('\n').trim() : '');
      if (text) return { ok: true, status: 200, text, model };
      return { ok: false, status: 502, detail: 'AI provider returned no text.' };
    }
    lastStatus = response.status;
    lastDetail = await response.text();
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    if (attempt < 2) await new Promise(r => setTimeout(r, retryDelay(response, attempt)));
  }
  return { ok: false, status: lastStatus, detail: lastDetail };
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'DRO AI chat', configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL, fallbackConfigured: Boolean(FALLBACK_MODEL), timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError('AI chat is not configured on the server.', 503);
    let body: any;
    try { body = await request.json(); } catch { return jsonError('Invalid JSON request.', 400); }
    const message = safeText(body?.message, 8000).trim();
    const context = safeText(body?.context, 24000);
    const extensionContext = safeText(body?.extensionContext, 24000);
    const extensionEnabled = body?.extensionEnabled === true;
    if (!message) return jsonError('Message is required.', 400);

    const prompt = `You are DRO, a live market-intelligence assistant. Use only supplied live context for market facts. Never invent prices, news, indicators, sources, or certainty. Clearly separate observed data from interpretation. Do not place trades or claim guaranteed profits. When discussing a setup, include risk and invalidation. If data is missing or stale, say so explicitly.\n\nLIVE CORE CONTEXT:\n${context}\n\nBROWSER EXTENSION CONTEXT (${extensionEnabled ? 'ACTIVE' : 'OFF'}):\n${extensionEnabled ? extensionContext || 'No extension snapshot available.' : 'Extension data must not be used.'}\n\nUSER MESSAGE:\n${message}`;

    const key = `${MODEL}|${extensionEnabled ? extensionContext : ''}|${context}|${message}`.slice(0, 60000);
    const existing = inFlight.get(key);
    if (existing) {
      const result = await existing;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    }

    const work = (async () => {
      let result = await callProvider(apiKey, MODEL, prompt);
      if (!result.ok && result.status === 429 && FALLBACK_MODEL && FALLBACK_MODEL !== MODEL) {
        result = await callProvider(apiKey, FALLBACK_MODEL, prompt);
      }
      if (!result.ok) {
        const isRateLimit = result.status === 429;
        return {
          status: isRateLimit ? 429 : result.status >= 500 ? 502 : result.status,
          body: {
            ok: false,
            error: isRateLimit ? 'AI provider is rate-limited right now. Please retry in a few seconds.' : `AI provider error (${result.status}).`,
            detail: result.detail?.slice(0, 700),
            retryable: isRateLimit || result.status >= 500,
            retryAfterMs: isRateLimit ? 3000 : 0,
          },
        };
      }
      return { status: 200, body: { ok: true, text: result.text, model: result.model, extensionEnabled, generatedAt: new Date().toISOString() } };
    })();
    inFlight.set(key, work);
    try {
      const result = await work;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      inFlight.delete(key);
    }
  } catch (error) {
    return jsonError('AI chat failed unexpectedly. Please retry.', 500, error instanceof Error ? error.message : 'unknown error');
  }
}
