import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function safeText(value: unknown, max = 12000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI chat is not configured: OPENAI_API_KEY is missing.' }, { status: 503 });
    const body = await request.json();
    const message = safeText(body?.message, 8000).trim();
    const context = safeText(body?.context, 16000);
    if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

    const prompt = `You are Market/Intel, a market-intelligence assistant. Use only the supplied live context for market facts. Never invent prices, news, indicators, sources, or certainty. Clearly separate observed data from interpretation. Do not place trades or claim guaranteed profits. Explain risk and invalidation when discussing a setup.\n\nLIVE CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: prompt, max_output_tokens: 1400 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: `AI provider error (${response.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await response.json();
    const text = typeof data?.output_text === 'string' ? data.output_text : (data?.output ?? []).flatMap((x: any) => x?.content ?? []).map((x: any) => x?.text ?? '').filter(Boolean).join('\n');
    if (!text) return NextResponse.json({ error: 'AI provider returned no text.' }, { status: 502 });
    return NextResponse.json({ text, model: MODEL, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI chat unavailable.' }, { status: 500 });
  }
}
