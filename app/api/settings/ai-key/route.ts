import { NextRequest, NextResponse } from 'next/server';
import { clearUserAIKey, getUserAIKey, maskAIKey, saveUserAIKey } from '@/lib/user-ai-key';

export const dynamic = 'force-dynamic';

async function discoverModels(apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, status: response.status, detail: detail.slice(0, 700), models: [] as string[] };
  }
  try {
    const data = await response.json();
    const models = Array.isArray(data?.data)
      ? data.data.map((m: any) => typeof m?.id === 'string' ? m.id : '').filter(Boolean)
      : [];
    return { ok: true, status: 200, detail: '', models };
  } catch {
    return { ok: false, status: 502, detail: 'Could not read the provider model list.', models: [] as string[] };
  }
}

function rankModel(id: string) {
  const s = id.toLowerCase();
  if (s === 'gpt-6-luna') return 0;
  if (s === 'gpt-6-sol') return 1;
  if (s === 'gpt-6-astra') return 2;
  if (s === 'gpt-6.1-sol') return 3;
  if (s === 'gpt-5.6-sol') return 4;
  if (s === 'gpt-4.1-mini') return 5;
  if (s === 'gpt-4o-mini') return 6;
  if (s === 'gpt-4o') return 7;
  if (s.startsWith('gpt-')) return 10;
  if (s.startsWith('chatgpt-')) return 20;
  return 100;
}

async function testModel(apiKey: string, model: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model, input: 'Reply with OK.', max_output_tokens: 64 }),
  });
  const detail = await response.text();
  return { ok: response.ok, status: response.status, detail: detail.slice(0, 700) };
}

async function testKey(apiKey: string) {
  const discovered = await discoverModels(apiKey);
  if (!discovered.ok) return discovered;
  const preferred = [process.env.OPENAI_MODEL, process.env.OPENAI_FALLBACK_MODEL, 'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o']
    .filter((x): x is string => Boolean(x));
  const discoveredCandidates = discovered.models
    .filter((id: string) => /^(gpt-|chatgpt-)/i.test(id))
    .sort((a: string, b: string) => rankModel(a) - rankModel(b));
  const candidates = [...new Set([
    ...preferred.filter(id => discoveredCandidates.includes(id)),
    ...discoveredCandidates,
  ])].slice(0, 5);

  let last = { ok: false, status: 400, detail: 'The key can access the API, but no listed model accepted a Responses API test request.' };
  for (const model of candidates) {
    try {
      const result = await testModel(apiKey, model);
      if (result.ok) return { ok: true, status: 200, detail: '', model, models: discovered.models };
      last = { ok: false, status: result.status, detail: result.detail };
      if (result.status === 401 || result.status === 403) break;
    } catch (e) {
      last = { ok: false, status: 502, detail: e instanceof Error ? e.message : 'Provider connection failed.' };
    }
  }
  return { ...last, models: discovered.models, candidates: candidates.slice(0, 30) };
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
        error: test.status === 401 ? 'The API key was rejected by the provider.' : test.status === 403 ? 'The API key is valid but does not have permission to use a compatible model.' : test.status === 400 || test.status === 404 ? 'The API key reached OpenAI, but none of the models available to this key accepted the DRO test request. The provider response is shown below so the exact access/quota/model issue can be fixed.' : `AI provider returned HTTP ${test.status}.`,
        detail: test.detail,
      }, { status: test.status === 429 ? 429 : 400 });
    }
    await saveUserAIKey(key);
    return NextResponse.json({ ok: true, configured: true, maskedKey: maskAIKey(key), provider: 'OpenAI', model: ('model' in test ? test.model : null) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not save AI key.' }, { status: 500 });
  }
}
