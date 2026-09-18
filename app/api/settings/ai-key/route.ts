import { NextRequest, NextResponse } from 'next/server';
import { clearUserAIKey, getUserAIKey, maskAIKey, saveUserAIKey } from '@/lib/user-ai-key';

export const dynamic = 'force-dynamic';

async function testKey(apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, status: response.status, detail: detail.slice(0, 400) };
  }
  return { ok: true, status: response.status };
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
    const test = await testKey(key, String(body?.model || 'gpt-5.6-luna'));
    if (!test.ok) {
      return NextResponse.json({
        ok: false,
        error: test.status === 401 ? 'The API key was rejected by the provider.' : `AI provider returned HTTP ${test.status}.`,
        detail: test.detail,
      }, { status: test.status === 429 ? 429 : 400 });
    }
    await saveUserAIKey(key);
    return NextResponse.json({ ok: true, configured: true, maskedKey: maskAIKey(key), provider: 'OpenAI' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not save AI key.' }, { status: 500 });
  }
}
