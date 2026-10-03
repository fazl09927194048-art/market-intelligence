import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { recordPrediction } from '@/lib/dro-learning';

export const dynamic = 'force-dynamic';

const inFlight = new Map<string, Promise<{ status: number; body: any }>>();
const liveCache = new Map<string, { at: number; data: any }>();
const LIVE_TTL = 3000;

function safeText(value: unknown, max = 12000) {
  const raw = typeof value === 'string' ? value : (() => {
    try { return JSON.stringify(value ?? ''); } catch { return String(value ?? ''); }
  })();
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
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

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n >= 100 ? n.toFixed(0) : n.toFixed(4);
}

function normalizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-12).map((item: any) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    text: safeText(item?.text, 1800).trim(),
  })).filter((item: any) => item.text);
}

function detectIntent(message: string, history: any[]) {
  const text = message.toLowerCase();
  if (/^(hi|hello|hey|سلام|درود|خوبی|چطوری)/.test(text)) return 'greeting';
  if (/help|کمک|چه کار|چی کار|قابلیت/.test(text)) return 'help';
  if (/price|قیمت|نرخ|چند/.test(text)) return 'price';
  if (/why|چرا|علت|دلیل/.test(text)) return 'why';
  if (/signal|سیگنال|لانگ|شورت|long|short|ورود|خروج/.test(text)) return 'trade';
  if (/news|خبر|اخبار|رویداد/.test(text)) return 'news';
  if (/image|chart|نمودار|عکس|تصویر/.test(text)) return 'chart';
  return history.length ? 'followup' : 'market';
}

function buildIndependentReply(cycle: any, message: string, imageAttached: boolean, history: any[] = []) {
  const signal = cycle?.signal ?? {};
  const plan = cycle?.tradePlan ?? {};
  const forecast = cycle?.forecast ?? {};
  const consensus = cycle?.consensus ?? {};
  const score = cycle?.intelligenceScore ?? {};
  const risk = cycle?.risk ?? {};
  const invalidation = cycle?.invalidation ?? {};
  const dataQuality = cycle?.dataValid ? 'VALID' : 'LIMITED';
  const direction = plan?.side || signal?.signal || 'NO TRADE';
  const intent = detectIntent(message, history);
  const previous = history.length ? history[history.length - 1]?.text : '';

  const lines = [
    'DRO مستقل فعال است — بدون API Key و بدون وابستگی به مدل خارجی.',
    intent === 'greeting' ? 'سلام. من DRO هستم. می‌توانم وضعیت بازار، قیمت، سیگنال، ریسک و دلیل تصمیم موتور را بررسی کنم.' :
      intent === 'help' ? 'قابلیت‌های فعلی: تحلیل زنده بازار، قیمت، سناریو و ریسک، پلن Entry/SL/TP، پیگیری مکالمه و دریافت تصویر نمودار.' :
      intent === 'followup' ? `این پاسخ ادامه پیام قبلی توست: «${previous.slice(0, 220)}»` : '',
    '',
    `وضعیت داده: ${dataQuality} | ${cycle?.symbol || 'BTCUSDT'} | ${cycle?.interval || '15m'}`,
    `تصمیم موتور: ${direction} | اعتماد گیت‌شده: ${Number(cycle?.confidenceGate?.after ?? signal?.confidence ?? 0).toFixed(0)}%`,
    `امتیاز هوش بازار: ${Number(score.score ?? 0).toFixed(0)}/100 | رژیم: ${score.regime || 'UNKNOWN'}`,
    `پیش‌بینی ساختاری: ${forecast.bias || 'UNAVAILABLE'} | اعتماد: ${Number(forecast.confidence ?? 0).toFixed(0)}%`,
    `اجماع تحلیلگران: ${consensus.direction || 'NEUTRAL'} | Long ${consensus.long ?? 0} / Short ${consensus.short ?? 0} | توافق ${Number(consensus.agreement ?? 0).toFixed(0)}%`,
    `ریسک: ${risk.level || 'UNKNOWN'} | ورود مجاز: ${invalidation.canEnter ? 'YES' : 'NO'}`,
  ];

  if (direction === 'LONG' || direction === 'SHORT') {
    lines.push(
      '',
      'پلن فعلی:',
      `Entry: ${money(plan.entry)}`,
      `Stop Loss: ${money(plan.stopLoss)}`,
      `Take Profit: ${money(plan.takeProfit)}`,
      `R/R: ${plan.riskReward ?? '—'}`,
      `زمان برنامه‌ریزی‌شده خروج: ${plan.exitAt ? new Date(plan.exitAt).toLocaleString() : '—'}`,
    );
  } else {
    lines.push('', 'نتیجه: فعلاً NO TRADE؛ گیت ایمنی یا همگرایی داده‌ها اجازه ورود جهت‌دار نمی‌دهد.');
  }

  if (invalidation?.reasons?.length) {
    lines.push('', `ابطال/هشدار اصلی: ${invalidation.reasons.slice(0, 3).join(' | ')}`);
  }
  if (Array.isArray(cycle?.warnings) && cycle.warnings.length) {
    lines.push('', `هشدارهای داده: ${cycle.warnings.slice(0, 3).join(' | ')}`);
  }
  if (imageAttached) {
    lines.push('', 'تصویر دریافت شد. در حالت مستقل فعلی، DRO از تصویر به‌عنوان ورودی دریافت‌شده آگاه است اما ادعای بینایی مولد نمی‌کند؛ تصمیم از موتور داده‌محور داخلی و داده زنده ساخته شده است.');
  }

  const lower = message.toLowerCase();
  if (/why|چرا|علت|دلیل/.test(lower)) {
    lines.push('', `دلیل اصلی: ${plan.analysis || signal.invalidation || 'ترکیب ساختار بازار، مومنتوم، جریان سفارش، چندتایم‌فریم، سناریو و گیت ریسک.'}`);
  }
  if (/price|قیمت|نرخ/.test(lower)) {
    lines.push('', `قیمت فعلی: ${money(cycle?.marketData?.futures?.price ?? cycle?.marketData?.spot?.price)}`);
  }

  lines.push('', 'این خروجی تحلیل مدل‌محور داخلی است و تضمین سود نیست. قبل از هر تصمیم، داده تازه و شرایط ابطال را دوباره بررسی کن.');
  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const symbol = safeText(request.nextUrl.searchParams.get('symbol') || 'BTCUSDT', 20);
  const interval = safeText(request.nextUrl.searchParams.get('interval') || '15m', 10);
  return NextResponse.json({
    ok: true,
    service: 'DRO Independent Intelligence',
    provider: 'internal-engine',
    configured: true,
    apiKeyRequired: false,
    symbol,
    interval,
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const guard = consumeRateLimit(request, 'ai-chat', 20);
  if (!guard.allowed) return jsonError('Too many DRO requests. Please retry shortly.', 429, { retryAfterMs: guard.retryAfter * 1000 });
  if (tooLarge(request, 8_000_000)) return jsonError('Request payload is too large. Compress the chart image and retry.', 413);

  try {
    let body: any;
    try { body = await request.json(); } catch { return jsonError('Invalid JSON request.', 400); }

    const message = safeText(body?.message, 7000).trim();
    const context = safeText(body?.context, 16000);
    const imageData = typeof body?.imageData === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.imageData) ? body.imageData : '';
    if (!message && !imageData) return jsonError('Message or chart image is required.', 400);

    const symbol = safeText(body?.symbol || context.match(/\"symbol\"\s*:\s*\"([A-Z0-9]+)\"/)?.[1] || 'BTCUSDT', 20).toUpperCase();
    const interval = safeText(body?.interval || context.match(/\"interval\"\s*:\s*\"([A-Za-z0-9]+)\"/)?.[1] || '15m', 10);

    let chartData: any = null;
    try {
      const live = await getLive(symbol, interval);
      chartData = {
        symbol,
        interval,
        fetchedAt: live.fetchedAt,
        spotPrice: live.spot.price,
        futuresPrice: live.futures.price,
        microstructure: live.microstructure,
        derivatives: live.derivatives,
        sourceHealth: live.sourceHealth,
        warnings: live.warnings,
        dataQuality: live.warnings?.length ? 'degraded' : 'live',
      };
    } catch {
      chartData = { symbol, interval, dataQuality: 'unavailable' };
    }

    const history = normalizeHistory(body?.history);
    const centralIntelligence = await runIntelligenceCycle(symbol, interval, null, null);
    // Every decision enters the measurable learning loop. No automatic production-code mutation is performed.
    const prediction = recordPrediction({
      symbol,
      interval,
      direction: String(centralIntelligence?.tradePlan?.side || centralIntelligence?.signal?.signal || 'NO TRADE'),
      confidence: Number(centralIntelligence?.confidenceGate?.after ?? centralIntelligence?.signal?.confidence ?? 0),
      entry: centralIntelligence?.tradePlan?.entry ?? null,
      target: centralIntelligence?.tradePlan?.takeProfit ?? null,
      stopLoss: centralIntelligence?.tradePlan?.stopLoss ?? null,
    });
    const key = `${symbol}|${interval}|${message}|${JSON.stringify(body?.toolContext || {})}|${imageData.slice(0, 80)}`.slice(0, 50000);
    const existing = inFlight.get(key);
    if (existing) {
      const result = await existing;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    }

    const work = (async () => {
      const text = buildIndependentReply(centralIntelligence, message, Boolean(imageData), history);
      return {
        status: 200,
        body: {
          ok: true,
          text,
          provider: 'internal-engine',
          model: 'DRO-INTERNAL',
          independent: true,
          apiKeyRequired: false,
          imageAttached: Boolean(imageData),
          chartEnabled: Boolean(body?.toolContext?.chart),
          tradePlan: centralIntelligence.tradePlan,
          chartVision: null,
          intelligence: {
            score: centralIntelligence.intelligenceScore,
            signal: centralIntelligence.signal,
            forecast: centralIntelligence.forecast,
            consensus: centralIntelligence.consensus,
            risk: centralIntelligence.risk,
            invalidation: centralIntelligence.invalidation,
            scenarios: centralIntelligence.scenarios,
            decisionTrace: centralIntelligence.decisionTrace,
            warnings: centralIntelligence.warnings,
          },
          chartData,
          predictionId: prediction.id,
          generatedAt: new Date().toISOString(),
        },
      };
    })();

    inFlight.set(key, work);
    try {
      const result = await work;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    } finally {
      inFlight.delete(key);
    }
  } catch (e) {
    return jsonError('DRO internal intelligence failed. Live market analysis is temporarily unavailable; retry shortly.', 502, {
      detail: e instanceof Error ? e.message : 'unknown error',
    });
  }
}
