import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { recordPrediction } from '@/lib/dro-learning';
import { persistPrediction } from '@/lib/dro-learning-db';
import { rememberConversation, getConversationContext } from '@/lib/dro-learning';
import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { listExchanges, getExchange, getTradingRisk, audit } from '@/lib/exchange/db';
import { exchangeManager } from '@/lib/exchange/manager';
import { analyzeChartImage } from '@/lib/chart-vision';

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

function isCloseCommand(message:string){const t=message.toLowerCase();return ['close','exit','sell','ببند','ببندش','بستن معامله','خارج شو','خروج بزن','سود کافی'].some(x=>t.includes(x))||(t.includes('ضرر')&&t.includes('ببند'))}
async function executeCloseCommand(symbol:string,reason:string){
 const jar=await cookies(); let userId=jar.get('fli_session')?.value; if(!userId){userId=crypto.randomUUID(); jar.set('fli_session',userId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:31536000,path:'/'});}
 const exchanges=await listExchanges(userId);
 if(exchanges.length!==1)return {ok:false,status:409,text:'برای بستن معامله، ابتدا یک صرافی فعال را انتخاب کن؛ بیش از یک اتصال وجود دارد.'};
 const x=await getExchange(userId,String(exchanges[0].id));
 const risk=await getTradingRisk(userId);
 if(risk.emergency_stop)return {ok:false,status:423,text:'Emergency Stop فعال است؛ دستور بستن از این مسیر اجرا نشد.'};
 if(!x.record.permissions?.trading)return {ok:false,status:403,text:'مجوز Trading روی کلید صرافی فعال نیست.'};
 const baseAsset=symbol.replace(/USDT$|USDC$|BUSD$|FDUSD$/,'');
 if(!baseAsset||baseAsset===symbol)return {ok:false,status:400,text:'بستن خودکار این نماد در حالت فعلی پشتیبانی نمی‌شود.'};
 const balances=await exchangeManager.balance(x.record.name,x.credentials);
 const row=Array.isArray(balances)?balances.find((v:any)=>String(v?.asset||'').toUpperCase()===baseAsset):null;
 const quantity=Number(row?.free||0);
 if(!Number.isFinite(quantity)||quantity<=0)return {ok:false,status:409,text:'موجودی قابل فروش برای این نماد پیدا نشد.'};
 const mode=String(risk.execution_mode||'PAPER').toUpperCase();
 const intent={exchangeId:String(exchanges[0].id),symbol,side:'SELL',type:'MARKET',quantity,reason};
 if(mode==='PAPER')return {ok:true,status:200,text:'در حالت PAPER، بستن معامله شبیه‌سازی شد.',mode,intent};
 if(mode==='CONFIRM')return {ok:true,status:202,text:'دستور بستن آماده است و برای اجرای واقعی تأیید صریح لازم دارد.',mode,intent};
 if(mode!=='AUTONOMOUS'||!risk.autonomous_enabled)return {ok:false,status:403,text:'اجرای خودکار فعال نیست. ابتدا Execution Mode و Autonomous Trading را فعال کن.'};
 if(process.env.FLI_LIVE_TRADING_ENABLED!=='true')return {ok:false,status:403,text:'Live execution توسط سرور قفل است.'};
 const order=await exchangeManager.createOrder(x.record.name,x.credentials,{symbol,side:'SELL',type:'MARKET',quantity:String(quantity),newOrderRespType:'FULL'});
 await audit({userId,action:'CLOSE_POSITION',exchange:x.record.name,symbol,source:'DRO_CHAT',result:'Position close submitted',status:String(order.status||'ACKNOWLEDGED')});
 return {ok:true,status:200,text:'دستور بستن معامله ارسال شد.',mode:'AUTONOMOUS',intent,order};
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
    if (isCloseCommand(message) && !imageData) {
      const close:any = await executeCloseCommand(symbol, message).catch((e:any)=>({ok:false,status:502,text:e instanceof Error?e.message:'Close action failed'}));
      if (close.ok) return NextResponse.json({ok:true,text:close.text,provider:'internal-engine',model:'DRO-INTERNAL',independent:true,action:'CLOSE_POSITION',mode:close.mode,intent:close.intent||null,order:close.order||null,generatedAt:new Date().toISOString()},{status:close.status});
      return jsonError(close.text, close.status);
    }
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

    const clientHistory = normalizeHistory(body?.history);
    const history = clientHistory.length ? clientHistory : getConversationContext(12);
    const chartVision = imageData ? await analyzeChartImage(imageData,{symbol,interval,chartData,clientContext:context}) : null;
    const centralIntelligence = await runIntelligenceCycle(symbol, interval, null, chartVision);
    // Every decision enters the measurable learning loop. No automatic production-code mutation is performed.
    rememberConversation('user', message);
    const prediction = recordPrediction({
      symbol,
      interval,
      direction: String(centralIntelligence?.tradePlan?.side || centralIntelligence?.signal?.signal || 'NO TRADE'),
      confidence: Number(centralIntelligence?.confidenceGate?.after ?? centralIntelligence?.signal?.confidence ?? 0),
      entry: centralIntelligence?.tradePlan?.entry ?? null,
      target: centralIntelligence?.tradePlan?.takeProfit ?? null,
      stopLoss: centralIntelligence?.tradePlan?.stopLoss ?? null,
    });
    void persistPrediction(prediction).catch(() => undefined);
    const key = `${symbol}|${interval}|${message}|${JSON.stringify(body?.toolContext || {})}|${imageData.slice(0, 80)}`.slice(0, 50000);
    const existing = inFlight.get(key);
    if (existing) {
      const result = await existing;
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    }

    const work = (async () => {
      const responseCycle=imageData?{...centralIntelligence,chartVision}:centralIntelligence;
      const text = buildIndependentReply(responseCycle, message, Boolean(imageData), history);
      rememberConversation('assistant', text);
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
          chartVision,
          imageIntelligence: imageData ? {
            visionAvailable: Boolean(chartVision?.available),
            evidenceRoutedToAnalysts: Boolean(chartVision?.available),
            specialistCoverage: Array.isArray(centralIntelligence.analysts) ? centralIntelligence.analysts.length : 0,
            finalDecisionOwner: 'DRO',
            finalTradePlan: centralIntelligence.tradePlan,
            decisionTrace: centralIntelligence.decisionTrace,
            consensus: centralIntelligence.consensus,
            risk: centralIntelligence.risk,
            invalidation: centralIntelligence.invalidation,
            scenarios: centralIntelligence.scenarios,
          } : null,
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
