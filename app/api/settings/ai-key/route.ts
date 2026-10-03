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
  const detail = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, detail: detail.slice(0, 700), models: [] as string[] };
  }
  try {
    const data = JSON.parse(detail);
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
  if (s === 'gpt-4.1-mini') return 0;
  if (s === 'gpt-4o-mini') return 1;
  if (s === 'gpt-4o') return 2;
  if (s.startsWith('gpt-')) return 10;
  if (s.startsWith('chatgpt-')) return 20;
  return 100;
}

async function verifyKey(apiKey: string) {
  const discovered = await discoverModels(apiKey);
  if (!discovered.ok) {
    let error = discovered.detail;
    try {
      const parsed = JSON.parse(discovered.detail);
      if (parsed?.error?.code === 'insufficient_quota' || parsed?.error?.code === 'credit_balance_exhausted') {
        error = 'The API key is valid, but this OpenAI project has no API credits remaining. Add API billing/credits to use DRO AI.';
      }
    } catch {}
    return { ...discovered, detail: error };
  }

  const compatibleModels = discovered.models
    .filter((id: string) => /^(gpt-|chatgpt-)/i.test(id))
    .sort((a: string, b: string) => rankModel(a) - rankModel(b));

  return {
    ok: true,
    status: 200,
    detail: '',
    models: discovered.models,
    model: compatibleModels[0] || null,
  };
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
  } catch {
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

    const verified = await verifyKey(key);
    if (!verified.ok) {
      const status = verified.status === 401 ? 401 : verified.status === 403 ? 403 : verified.status === 429 ? 429 : 400;
      const quota = /insufficient_quota|credit_balance_exhausted|no api credits|no credits remaining/i.test(verified.detail);
      const error = quota
        ? 'کلید از نظر دسترسی API شناخته شد، اما اعتبار API این پروژه صفر است. برای چت DRO باید در OpenAI API Billing اعتبار/پرداخت فعال داشته باشی.'
        : verified.status === 401
          ? 'The API key was rejected by OpenAI.'
          : verified.status === 403
            ? 'The API key reached OpenAI but this project does not have permission to list models.'
            : verified.status === 429
              ? 'OpenAI rate-limited this verification request. Please retry in a moment.'
              : 'OpenAI could not verify this API key.';
      return NextResponse.json({ ok: false, error, detail: verified.detail }, { status });
    }

    await saveUserAIKey(key);

    return NextResponse.json({
      ok: true,
      configured: true,
      maskedKey: maskAIKey(key),
      provider: 'OpenAI',
      model: verified.model,
      modelCount: verified.models.length,
      note: verified.model
        ? 'Key verified. DRO will select a model available to this key when you send a request.'
        : 'Key verified, but no GPT/ChatGPT model was listed. Check model access in your OpenAI project before using DRO AI.',
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Could not save AI key.',
    }, { status: 500 });
  }
}
