import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function safeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function jsonError(message: string, status: number, detail?: string) {
  return NextResponse.json({ ok: false, error: message, detail: detail?.slice(0, 700) }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'DRO AI chat', configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL, timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return jsonError('AI chat is not configured on the server.', 503);
    let body: any;
    try { body = await request.json(); } catch { return jsonError('Invalid JSON request.', 400); }
    const message = safeText(body?.message, 8000).trim();
    const context = safeText(body?.context, 24000);
    if (!message) return jsonError('Message is required.', 400);

    const prompt = `You are DRO, a live market-intelligence assistant. Use only the supplied live context for market facts. Never invent prices, news, indicators, sources, or certainty. Clearly separate observed data from interpretation. Do not place trades or claim guaranteed profits. When discussing a setup, include risk and invalidation. If data is missing or stale, say so explicitly.\n\nLIVE CONTEXT:\n${context}\n\nUSER MESSAGE:\n${message}`;

    let response: Response | null = null;
    let lastDetail = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, input: prompt, max_output_tokens: 1600 }),
          cache: 'no-store',
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        lastDetail = error instanceof Error ? error.message : 'Network error';
        if (attempt === 0) { await new Promise(r => setTimeout(r, 350)); continue; }
        return jsonError('AI provider connection failed. Please retry.', 502, lastDetail);
      }
      if (response.ok) break;
      lastDetail = await response.text();
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) {
        return jsonError(`AI provider error (${response.status}).`, 502, lastDetail);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!response?.ok) return jsonError('AI provider unavailable.', 502, lastDetail);
    const data = await response.json();
    const text = typeof data?.output_text === 'string'
      ? data.output_text.trim()
      : (Array.isArray(data?.output) ? data.output.flatMap((x: any) => Array.isArray(x?.content) ? x.content : []).map((x: any) => x?.text ?? '').filter(Boolean).join('\n').trim() : '');
    if (!text) return jsonError('AI provider returned no text.', 502);
    return NextResponse.json({ ok: true, text, model: MODEL, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return jsonError('AI chat failed unexpectedly. Please retry.', 500, error instanceof Error ? error.message : 'unknown error');
  }
}
