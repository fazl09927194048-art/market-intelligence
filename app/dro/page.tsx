'use client';

import React, { useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; text: string; time: number };
const starters = [
  ['◈', 'Analyze the market', 'Analyze the current crypto market. Separate verified live data from assumptions and explain the risks.'],
  ['⌁', 'Explain a complex idea', 'Explain a complex topic clearly, step by step, with examples.'],
  ['⌘', 'Help me build', 'Help me plan, implement, and test a software feature. Start with requirements and acceptance criteria.'],
  ['◎', 'Research a question', 'Research this question carefully, distinguish facts from uncertainty, and give an evidence-based answer.']
];
const btn: React.CSSProperties = { border: '1px solid #454545', background: '#262626', color: '#e8e8e8', borderRadius: 10, padding: '9px 12px', cursor: 'pointer' };

export default function DROChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Checking DRO engine…');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setIntervalValue] = useState('15m');
  const [fa, setFa] = useState(false);
  const [imageData, setImageData] = useState('');
  const [imageName, setImageName] = useState('');
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('dro-full-chat-history') || '[]'); if (Array.isArray(saved)) setMessages(saved.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-80)); } catch {}
    setReady(true);
    fetch('/api/chat', { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json() })).then(({ok, data}) => setStatus(ok ? (data?.configured ? 'DRO engine connected' : 'DRO ready · fallback may be limited') : 'DRO engine status unavailable')).catch(() => setStatus('Connection status unavailable'));
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem('dro-full-chat-history', JSON.stringify(messages.slice(-80))); } catch {} } }, [messages, ready]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && !imageData) || busy) return;
    setBusy(true); setError('');
    const userText = text || (fa ? 'این تصویر را بررسی کن.' : 'Please analyze this image.');
    const userMessage: Message = { role: 'user', text: imageName ? userText + '\n[Image attached: ' + imageName + ']' : userText, time: Date.now() };
    setMessages(prev => [...prev, userMessage].slice(-80)); setInput('');
    try {
      const context = { interface: 'DRO full-page chat', symbol, interval, timestamp: new Date().toISOString(), mode: 'evidence-first' };
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ message: userText, symbol, interval, context: JSON.stringify(context), history: messages.slice(-12).map(({role, text}) => ({role, text})), imageData: imageData || undefined, toolContext: { dro: true, chart: true, symbol, interval, source: 'dro-page' } }) });
      let data: any; try { data = await response.json(); } catch { throw new Error(fa ? 'پاسخ نامعتبر از سرور دریافت شد.' : 'The server returned an invalid response.'); }
      if (!response.ok) throw new Error(data?.error || (fa ? 'پاسخ از DRO دریافت نشد.' : 'DRO could not respond.'));
      let reply = String(data?.text || data?.answer || (fa ? 'پاسخ متنی دریافت نشد.' : 'No text response was returned.'));
      if (data?.tradePlan) reply += '\n\n' + (fa ? 'خلاصه برنامه معامله' : 'Trade plan') + ':\n' + JSON.stringify(data.tradePlan, null, 2);
      setMessages(prev => [...prev, { role: 'assistant', text: reply, time: Date.now() }].slice(-80));
      setStatus(data?.generationMode === 'provider' ? 'DRO · model connected' : 'DRO · ' + (data?.generationMode || 'fallback mode'));
      setImageData(''); setImageName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DRO request failed');
      setMessages(prev => [...prev, { role: 'assistant', text: fa ? 'این درخواست کامل نشد. خطا را بررسی کن و دوباره تلاش کن.' : 'This request did not complete. Check the error below and try again.', time: Date.now() }].slice(-80));
    } finally { setBusy(false); inputRef.current?.focus(); }
  };
  const clear = () => { if (busy) return; setMessages([]); setError(''); setImageData(''); setImageName(''); try { localStorage.removeItem('dro-full-chat-history'); } catch {} };
  const attach = (file?: File) => {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setError(fa ? 'فقط PNG، JPG یا WebP پشتیبانی می‌شود.' : 'Only PNG, JPG, or WebP images are supported.'); return; }
    if (file.size > 12 * 1024 * 1024) { setError(fa ? 'حداکثر اندازه تصویر ۱۲ مگابایت است.' : 'Maximum image size is 12 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => { setImageData(String(reader.result || '')); setImageName(file.name); setError(''); }; reader.onerror = () => setError('Could not read image.'); reader.readAsDataURL(file);
  };
  const side: React.CSSProperties = { background: '#171717', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid #303030' };
  const panel: React.CSSProperties = { border: '1px solid #414141', background: '#252525', color: '#eee', borderRadius: 14, padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start' };

  return <main dir={fa ? 'rtl' : 'ltr'} style={{ minHeight: '100dvh', background: '#212121', color: '#ececec', fontFamily: 'Inter,system-ui,sans-serif', display: 'grid', gridTemplateColumns: '240px minmax(0,1fr)' }}>
    <style jsx global>{'body{margin:0;background:#212121}*{box-sizing:border-box}textarea,button,select{font:inherit}@media(max-width:700px){.dro-side{display:none!important}.dro-layout{grid-template-columns:1fr!important}.dro-compose{left:0!important;padding:10px!important}.dro-msg{grid-template-columns:28px minmax(0,1fr)!important}.dro-prompts{grid-template-columns:1fr!important}.dro-top-status{display:none!important}}'}</style>
    <aside className="dro-side" style={side}>
      <a href="/dro" style={{ color: '#eee', textDecoration: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, padding: 6 }}><span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#102017', border: '1px solid #326447', color: '#9df5b9', fontSize: 20 }}>✳</span><span>DRO <small style={{ display: 'block', color: '#8ee8a8', fontSize: 10 }}>OMNIBRAIN</small></span></a>
      <button style={{ ...btn, textAlign: 'left' }} onClick={clear}>＋ {fa ? 'گفت‌وگوی جدید' : 'New chat'}</button>
      <small style={{ color: '#888', padding: 7 }}>{fa ? 'فضای کاری هوشمند' : 'YOUR INTELLIGENCE SPACE'}</small>
      <div style={{ marginTop: 'auto', border: '1px solid #303030', borderRadius: 12, padding: 12, color: '#aaa', fontSize: 12, lineHeight: 1.7 }}><b style={{ color: '#ddd' }}>{fa ? 'مغز چندابزاری DRO' : 'DRO multi-tool brain'}</b><br/>{fa ? 'گفت‌وگو، تحلیل تصویر و زمینه بازار در یک فضای مستقل.' : 'Chat, image analysis and market context in one dedicated workspace.'}</div>
      <a href="/" style={{ ...btn, textDecoration: 'none', textAlign: 'center' }}>{fa ? 'بازگشت به داشبورد' : 'Back to dashboard'}</a>
    </aside>
    <section className="dro-layout" style={{ minWidth: 0, minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <header className="dro-top" style={{ height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 20px', borderBottom: '1px solid #303030' }}><b>DRO <span style={{ color: '#999', fontWeight: 400 }}>/ {fa ? 'گفت‌وگوی هوشمند' : 'AI workspace'}</span></b><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><small className="dro-top-status" style={{ color: '#aaa' }}>● {status}</small><button style={btn} onClick={() => setFa(v => !v)}>{fa ? 'EN' : 'FA'}</button><button style={btn} onClick={clear}>＋</button></div></header>
      <div style={{ width: 'min(820px,100%)', margin: '0 auto', padding: '24px 22px 230px', flex: 1 }}>
        {messages.length === 0 ? <div style={{ minHeight: 'calc(100dvh - 340px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '18px 0 32px' }}>
          <div style={{ width: 60, height: 60, border: '1px solid #3c6448', borderRadius: 20, display: 'grid', placeItems: 'center', background: '#102017', color: '#9bf0b4', fontSize: 28, marginBottom: 20 }}>✳</div>
          <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', letterSpacing: '-.04em', margin: '0 0 12px', fontWeight: 650 }}>{fa ? 'امروز چه چیزی را بررسی کنیم؟' : 'What can I help you with?'}</h1>
          <p style={{ maxWidth: 560, color: '#aaa', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{fa ? 'من DRO هستم؛ درخواستت را بنویس. از ابزارها و داده‌های متصل کمک می‌گیرم و محدودیت‌ها را شفاف می‌گویم.' : 'I’m DRO. Ask a question, explore an idea, analyze a chart, or work through a complex task. I’ll be clear about evidence and limitations.'}</p>
          <div className="dro-prompts" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, width: '100%', marginTop: 28 }}>{starters.map(([icon, title, prompt]) => <button key={title} style={panel} onClick={() => void send(fa ? ({ 'Analyze the market': 'بازار فعلی رمزارزها را با تفکیک داده‌های زنده از فرضیه‌ها تحلیل کن و ریسک‌ها را توضیح بده.', 'Explain a complex idea': 'یک موضوع پیچیده را مرحله‌به‌مرحله و با مثال توضیح بده.', 'Help me build': 'برای ساخت و آزمون یک قابلیت نرم‌افزاری کمکم کن؛ ابتدا نیازمندی‌ها و معیارهای پذیرش را مشخص کن.', 'Research a question': 'این پرسش را دقیق بررسی کن، واقعیت را از عدم‌قطعیت جدا کن و پاسخی مبتنی بر شواهد بده.' } as Record<string,string>)[title] : prompt)}><span style={{ width: 30, height: 30, flex: '0 0 30px', border: '1px solid #444', borderRadius: 10, display: 'grid', placeItems: 'center', color: '#a3e9b7' }}>{icon}</span><span><b style={{ display: 'block', fontSize: 13, marginBottom: 5 }}>{fa ? ({'Analyze the market':'تحلیل بازار','Explain a complex idea':'توضیح یک موضوع','Help me build':'ساخت و برنامه‌نویسی','Research a question':'پژوهش و بررسی'} as Record<string,string>)[title] : title}</b><small style={{ display: 'block', color: '#999', fontSize: 11, lineHeight: 1.5 }}>{fa ? 'برای شروع انتخاب کن' : prompt}</small></span></button>)}</div>
        </div> : <div style={{ display: 'grid', gap: 25, paddingTop: 10 }}>{messages.map((m, i) => <article className="dro-msg" key={m.time + '-' + i} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr)', gap: 13, alignItems: 'start' }}><div style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: m.role === 'assistant' ? '#102017' : '#303030', border: '1px solid ' + (m.role === 'assistant' ? '#31563d' : '#484848'), color: m.role === 'assistant' ? '#a2f5b8' : '#eee' }}>{m.role === 'assistant' ? '✳' : '●'}</div><div><div style={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.text}</div><small style={{ color: '#777' }}>{m.role === 'assistant' ? 'DRO' : (fa ? 'شما' : 'You')}</small></div></article>)}{busy && <div style={{ color: '#aaa', padding: 8 }}>{fa ? 'DRO در حال بررسی درخواست است…' : 'DRO is thinking…'}</div>}<div ref={endRef}/></div>}
      </div>
      <div className="dro-compose" style={{ position: 'fixed', bottom: 0, left: 240, right: 0, padding: '18px 22px 12px', background: 'linear-gradient(180deg,rgba(33,33,33,0),#212121 22%,#212121)' }}>
        {error && <div style={{ width: 'min(820px,100%)', margin: '0 auto 8px', padding: 10, border: '1px solid #713b3b', background: '#321c1c', borderRadius: 10, color: '#ffb6b6', fontSize: 12 }}>{error}</div>}
        <div style={{ width: 'min(820px,100%)', margin: '0 auto', border: '1px solid #4b4b4b', borderRadius: 22, background: '#303030', padding: '12px 13px 9px', boxShadow: '0 8px 32px #0003' }}>
          {imageName && <div style={{ color: '#9bf0b4', fontSize: 11, padding: '4px 4px 10px' }}>▧ {imageName} <button style={{ ...btn, padding: '2px 7px' }} onClick={() => { setImageData(''); setImageName(''); }}>×</button></div>}
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={fa ? 'از DRO هر چیزی بپرس…' : 'Message DRO…'} aria-label="Message DRO" style={{ display: 'block', width: '100%', minHeight: 56, maxHeight: 180, resize: 'vertical', border: 0, outline: 0, background: 'transparent', color: '#f1f1f1', fontSize: 14, lineHeight: 1.6, padding: '4px 4px 9px' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><button style={btn} onClick={() => fileRef.current?.click()}>＋ {fa ? 'تصویر' : 'Attach'}</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { attach(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }}/><select aria-label="Market symbol" value={symbol} onChange={e => setSymbol(e.currentTarget.value)} style={{ ...btn, maxWidth: 115, padding: 8 }}><option>BTCUSDT</option><option>ETHUSDT</option><option>SOLUSDT</option><option>BNBUSDT</option><option>XRPUSDT</option><option>ADAUSDT</option></select><select aria-label="Timeframe" value={interval} onChange={e => setIntervalValue(e.currentTarget.value)} style={{ ...btn, maxWidth: 76, padding: 8 }}><option>5m</option><option>15m</option><option>1h</option><option>4h</option><option>1d</option></select></div><button disabled={busy || (!input.trim() && !imageData)} onClick={() => void send()} aria-label="Send message" style={{ ...btn, width: 38, height: 38, padding: 0, background: '#f0f0f0', color: '#151515', fontSize: 21, opacity: busy || (!input.trim() && !imageData) ? .35 : 1 }}>{busy ? '…' : '↑'}</button></div>
        </div><div style={{ width: 'min(820px,100%)', margin: '8px auto 0', textAlign: 'center', color: '#858585', fontSize: 10, lineHeight: 1.5 }}>{fa ? 'DRO ممکن است اشتباه کند؛ اطلاعات مهم را بررسی کن. قابلیت‌ها به مدل‌ها و ابزارهای متصل وابسته‌اند.' : 'DRO can make mistakes. Verify important information; available features depend on connected models and tools.'}</div>
      </div>
    </section>
  </main>;
}
