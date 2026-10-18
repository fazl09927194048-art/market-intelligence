import { NextRequest, NextResponse } from 'next/server';
import { getAdvancedMarketData } from '@/lib/market-advanced';
import { consumeRateLimit, tooLarge } from '@/lib/request-guard';
import { runIntelligenceCycle } from '@/lib/intelligence-loop';
import { recordPrediction } from '@/lib/dro-learning';
import { persistPrediction } from '@/lib/dro-learning-db';
import { rememberConversation, getConversationContext } from '@/lib/dro-learning';
import { getSessionUserId } from '@/lib/exchange/session';
import { resolveActiveTrades, executeCloseCommand as executeTrackedClose } from '@/lib/trade-command-engine';
import { analyzeChartImage, buildImageTradePlan } from '@/lib/chart-vision';

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
 const userId=await getSessionUserId();
 const trades=await resolveActiveTrades(userId,symbol);
 if(trades.length!==1){
  return {ok:false,status:409,text:trades.length===0?'برای این نماد معامله فعال ثبت‌شده‌ای پیدا نشد.':'برای این نماد بیش از یک معامله فعال وجود دارد؛ ابتدا معامله موردنظر را از بخش Trading انتخاب کن.'};
 }
 const tradeId=String(trades[0].id);
 const execution:any=await executeTrackedClose(userId,tradeId,'CLOSE_POSITION',100);
 const mode=execution?.mode||'PAPER';
 const text=mode==='PAPER'?'در حالت PAPER، دستور بستن معامله شبیه‌سازی شد.':mode==='CONFIRM'?'دستور بستن آماده است و برای اجرای واقعی تأیید صریح لازم دارد.':'دستور بستن معامله برای اجرای واقعی ارسال شد.';
 return {ok:true,status:200,text,mode,intent:execution?.intent||null,order:execution?.order||null,execution,tradeId};
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
    intent === 'greeting' ? 'سلام، من DRO هستم. می‌توانم وضعیت بازار و دلیل تصمیم را بررسی کنم. بپرس چه چیزی می‌خواهی بدانیم.' :
      intent === 'help' ? 'می‌توانم داده زنده بازار، ساختار و سناریوها، ریسک، Entry/SL/TP و تصویر نمودار را بررسی کنم. برای دستورهای معاملاتی، حالت اجرای حساب را هم باید در نظر گرفت.' :
      intent === 'followup' ? `با توجه به گفت‌وگوی قبلی، ادامه را روی داده فعلی بازار می‌دهم. اگر منظورت بخش مشخصی از پاسخ قبلی است، نامش را بگو تا همان را دقیق‌تر بررسی کنم.` : '',
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
    const v:any=cycle?.chartVision;
    const ip:any=cycle?.imageTradePlan;
    lines.push('', v?.available
      ? `Chart Vision: ${v.direction} | اعتماد ${Number(v.confidence||0).toFixed(0)}% | کیفیت تصویر ${Number(v.visualQuality||0).toFixed(0)}%.`
      : 'Chart Vision فعال نیست؛ هیچ مقدار بصری حدسی وارد تصمیم نشده است.');
    if(v?.symbol) lines.push(`نماد تصویر: ${v.symbol} | تایم‌فریم: ${v.timeframe||'—'}.`);
    if(v?.marketStructure) lines.push(`ساختار بازار تصویر: ${v.marketStructure}.`);
    if(Array.isArray(v?.patterns)&&v.patterns.length) lines.push(`الگوها: ${v.patterns.slice(0,5).join(' | ')}.`);
    if(ip?.available){
      lines.push('', 'پلن استخراج‌شده از سطوح قابل‌خواندن تصویر:', `Entry: ${money(ip.entry)}`, `Stop Loss: ${money(ip.stopLoss)} (${Number(ip.stopLossPct||0).toFixed(2)}%)`, `TPها: ${ip.takeProfits.map((x:number,i:number)=>money(x)+` (${Number(ip.takeProfitPcts?.[i]||0).toFixed(2)}%)`).join(' | ')}`, `R/R: ${ip.riskReward ? Number(ip.riskReward).toFixed(2) : '—'}`);
    }
    if(Array.isArray(v?.uncertainty)&&v.uncertainty.length) lines.push(`ابهام‌های تصویر: ${v.uncertainty.slice(0,3).join(' | ')}.`);
    lines.push(`تصمیم نهایی همچنان متعلق به DRO است و با داده زنده، تحلیلگران، نقدینگی و گیت ریسک تطبیق داده شده است.`);
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

async function generateConversationalReply(message:string,history:any[],cycle:any,chartVision:any,imageTradePlan:any):Promise<{text:string|null;mode:'provider'|'rules';provider?:string;error?:string}> {
  const key=process.env.DRO_CHAT_API_KEY||process.env.OPENAI_API_KEY||'';
  if(!key)return {text:null,mode:'rules',error:'CHAT_PROVIDER_NOT_CONFIGURED'};
  const endpoint=(process.env.DRO_CHAT_ENDPOINT||'https://api.openai.com/v1/chat/completions').replace(/\/$/, '');
  const model=process.env.DRO_CHAT_MODEL||process.env.OPENAI_CHAT_MODEL||'gpt-4o-mini';
  const system='You are DRO, the conversational intelligence interface for a crypto market-analysis platform. Answer the actual user message directly in the user’s language. Maintain multi-turn context, ask a concise clarification if needed, and never repeat a generic report unless asked. Treat supplied market data and chart-vision output as evidence, not guaranteed truth. Do not invent image readings, prices, trades, or probabilities. Never claim a trade was executed unless execution data explicitly confirms it. Distinguish market scenario P/L percentages from actual account P/L. For trade ideas, respect the risk gate and say NO TRADE when it blocks entry. You may discuss general topics beyond trading; be clear about the limits of the internal market engine.';
  const payload={symbol:cycle?.symbol,interval:cycle?.interval,liveMarket:{price:cycle?.marketData?.futures?.price??cycle?.marketData?.spot?.price,regime:cycle?.intelligenceScore?.regime,dataValid:cycle?.dataValid,signal:cycle?.signal,tradePlan:cycle?.tradePlan,forecast:cycle?.forecast,consensus:cycle?.consensus,risk:cycle?.risk,invalidation:cycle?.invalidation,warnings:cycle?.warnings},chartVision:chartVision?{available:chartVision.available,direction:chartVision.direction,confidence:chartVision.confidence,visualQuality:chartVision.visualQuality,symbol:chartVision.symbol,timeframe:chartVision.timeframe,lastVisiblePrice:chartVision.lastVisiblePrice,trend:chartVision.trend,marketStructure:chartVision.marketStructure,support:chartVision.support,resistance:chartVision.resistance,patterns:chartVision.patterns,evidence:chartVision.evidence,uncertainty:chartVision.uncertainty,error:chartVision.error}:null,imageTradePlan};
  try{
    const response=await fetch(endpoint+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify({model,temperature:0.3,max_tokens:1200,messages:[{role:'system',content:system},{role:'system',content:'Current structured context: '+JSON.stringify(payload)},...history.slice(-10).map((m:any)=>({role:m.role==='assistant'?'assistant':'user',content:String(m.text||'').slice(0,3000)})),{role:'user',content:message||'Please analyze the uploaded chart using the supplied vision evidence.'}]}),cache:'no-store',signal:AbortSignal.timeout(18000)});
    if(!response.ok)throw new Error('chat provider returned HTTP '+response.status);
    const data:any=await response.json();const text=typeof data?.choices?.[0]?.message?.content==='string'?data.choices[0].message.content.trim():'';
    if(!text)throw new Error('chat provider returned an empty answer');
    return {text,mode:'provider',provider:model};
  }catch(error){return {text:null,mode:'rules',error:error instanceof Error?error.message:'CHAT_PROVIDER_FAILED'};}
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
    const imageTradePlan = chartVision ? buildImageTradePlan(chartVision) : null;
    const centralIntelligence = await runIntelligenceCycle(symbol, interval, null, chartVision);
    if (imageTradePlan?.available) {
      const liveSide = centralIntelligence.tradePlan?.side || 'NO TRADE';
      const imageSide = imageTradePlan.side;
      const sideConflict = liveSide !== 'NO TRADE' && liveSide !== imageSide;
      (centralIntelligence as any).imageDecisionAudit = {
        imageSide,
        liveSide,
        sideConflict,
        imageEntry: imageTradePlan.entry,
        imageStopLoss: imageTradePlan.stopLoss,
        imageTakeProfits: imageTradePlan.takeProfits,
        imageRiskReward: imageTradePlan.riskReward,
        imageStopLossPct: imageTradePlan.stopLossPct,
        imageTakeProfitPcts: imageTradePlan.takeProfitPcts,
        rule: sideConflict ? 'IMAGE_LIVE_CONFLICT: DRO final decision remains NO TRADE until evidence converges.' : 'IMAGE_LIVE_CONSISTENT: image levels are candidate evidence only; live risk engine remains authoritative.'
      };
      if (sideConflict) {
        centralIntelligence.warnings = [...(centralIntelligence.warnings || []), 'Image-derived direction conflicts with live DRO direction; image plan is not promoted to execution.'];
      }
    }
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
      const responseCycle=imageData?{...centralIntelligence,chartVision,imageTradePlan}:centralIntelligence;
      const generated = await generateConversationalReply(message, history, responseCycle, chartVision, imageTradePlan);
      const text = generated.text || buildIndependentReply(responseCycle, message, Boolean(imageData), history);
      rememberConversation('assistant', text);
      return {
        status: 200,
        body: {
          ok: true,
          text,
          provider: 'internal-engine',
          model: generated.mode === 'provider' ? (generated.provider || 'configured-chat-model') : 'DRO-INTERNAL-RULES',
          independent: generated.mode !== 'provider',
          generationMode: generated.mode,
          chatProviderConfigured: generated.mode === 'provider',
          fallbackReason: generated.mode === 'rules' ? generated.error || 'CHAT_PROVIDER_NOT_CONFIGURED' : null,
          apiKeyRequired: false,
          imageAttached: Boolean(imageData),
          chartEnabled: Boolean(body?.toolContext?.chart),
          tradePlan: centralIntelligence.tradePlan,
          chartVision,
          imageTradePlan,
          imageIntelligence: imageData ? {
            visionAvailable: Boolean(chartVision?.available),
            evidenceRoutedToAnalysts: Boolean(chartVision?.available),
            specialistCoverage: Array.isArray(centralIntelligence.analysts) ? centralIntelligence.analysts.length : 0,
            finalDecisionOwner: 'DRO',
            imageTradePlan,
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
