import { NextRequest, NextResponse } from 'next/server';
import { clearUserAIKey, getUserAIKey, maskAIKey, saveUserAIKey } from '@/lib/user-ai-key';

export const dynamic = 'force-dynamic';

async function testKey(apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const modelsResponse = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!modelsResponse.ok) {
    const detail = await modelsResponse.text();
    return { ok: false, status: modelsResponse.status, detail: detail.slice(0, 500) };
  }

  const preferred = [process.env.OPENAI_MODEL, process.env.OPENAI_FALLBACK_MODEL, 'gpt-6-luna', 'gpt-6-sol', 'gpt-4.1-mini']
    .filter((x): x is string => Boolean(x))
    .filter((x, i, a) => a.indexOf(x) === i);
  let discovered: string[] = [];
  try {
    const models = await modelsResponse.json();
    discovered = Array.isArray(models?.data)
      ? models.data.map((m: any) => typeof m?.id === 'string' ? m.id : '').filter(Boolean)
      : [];
  } catch {}
  const likely = discovered
    .filter(id => /^(gpt-|chatgpt-)/i.test(id))
    .sort((a,b) => {
      const rank=(id:string)=>preferred.includes(id)?0:/gpt-6-luna/i.test(id)?1:/gpt-6-sol/i.test(id)?2:/gpt-5/i.test(id)?3:/gpt-4.1/i.test(id)?4:/gpt-4o/i.test(id)?5:10;
      return rank(a)-rank(b);
    });
  const configured = [...new Set([...preferred.filter(id => discovered.length === 0 || discovered.includes(id)), ...likely])];

  let last = { ok: false, status: 400, detail: 'No compatible model could answer a test request.' };
  for (const model of configured) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model, input: 'Reply with OK.', max_output_tokens: 8 }),
      });
      if (response.ok) return { ok: true, status: 200, model };
      const detail = await response.text();
      last = { ok: false, status: response.status, detail: detail.slice(0, 500) };
      if (response.status === 401 || response.status === 403) break;
    } catch (e) {
      last = { ok: false, status: 502, detail: e instanceof Error ? e.message : 'Provider connection failed.' };
    }
  }
  return last;
}

export async function GET() {
  try {
    const key = await getUserAIKey();
    return NextResponse.json({
      ok: true,
      configured: Boolean(key),
      maskedKey: maskAIKey(key),
      provider: key ? 'OpenAI' : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'AI key storage is not configured securely.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || 'save');
    if (action === 'remove') {
      await clearUserAIKey();
      return NextResponse.json({ ok: true, configured: false });
    }
    const key = String(body?.apiKey || '').trim();
    if (!key || key.length < 20 || key.length > 500) {
      return NextResponse.json({ ok: false, error: 'Enter a valid AI API key.' }, { status: 400 });
    }
    const test = await testKey(key);
    if (!test.ok) {
      return NextResponse.json({
        ok: false,
        error: test.status === 401 ? 'The API key was rejected by the provider.' : test.status === 403 ? 'The API key is valid but does not have permission to use a compatible model.' : test.status === 400 || test.status === 404 ? 'The API key is valid, but no compatible DRO model is available to this project.' : `AI provider returned HTTP ${test.status}.`,
        detail: test.detail,
      }, { status: test.status === 429 ? 429 : 400 });
    }
    await saveUserAIKey(key);
    return NextResponse.json({ ok: true, configured: true, maskedKey: maskAIKey(key), provider: 'OpenAI', model: test.model || null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not save AI key.' }, { status: 500 });
  }
}
