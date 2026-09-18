'use client';
import React,{useEffect,useState} from 'react';

export default function SettingsPage(){
 const [configured,setConfigured]=useState(false),[masked,setMasked]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const load=async()=>{setBusy(true);try{const r=await fetch('/api/settings/ai-key',{cache:'no-store'});const d=await r.json();setConfigured(Boolean(d.configured));setMasked(d.maskedKey||'');if(!r.ok)throw new Error(d.error||'Settings unavailable')}catch(e){setError(e instanceof Error?e.message:'Settings unavailable')}finally{setBusy(false)}};
 useEffect(()=>{void load()},[]);
 const save=async()=>{if(!key.trim())return;setSaving(true);setMessage('');setError('');try{const r=await fetch('/api/settings/ai-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save',apiKey:key.trim()})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save key');setConfigured(true);setMasked(d.maskedKey||'');setKey('');setMessage('Key verified and securely saved for this browser. DRO will use it automatically.')}catch(e){setError(e instanceof Error?e.message:'Could not save key')}finally{setSaving(false)}};
 const remove=async()=>{setSaving(true);setMessage('');setError('');try{const r=await fetch('/api/settings/ai-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'remove'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not remove key');setConfigured(false);setMasked('');setMessage('Saved AI key removed.')}catch(e){setError(e instanceof Error?e.message:'Could not remove key')}finally{setSaving(false)}};
 return <main style={{minHeight:'100vh',background:'#06080c',color:'#e8edf2',padding:'28px 18px',fontFamily:'system-ui,sans-serif'}}>
  <div style={{maxWidth:760,margin:'0 auto'}}>
   <a href="/" style={{color:'#8ff5ae',textDecoration:'none',fontWeight:800}}>← MARKET/INTEL</a>
   <div style={{marginTop:38,border:'1px solid #1c2924',borderRadius:20,padding:'28px',background:'#0b1110'}}>
    <div style={{fontSize:12,color:'#8ff5ae',fontWeight:900,letterSpacing:2}}>DRO SETTINGS</div>
    <h1 style={{fontSize:32,margin:'8px 0'}}>AI Provider Key</h1>
    <p style={{color:'#9aa59f',lineHeight:1.7}}>کلید API خودت را یک‌بار وارد کن. سیستم آن را روی سرور به‌صورت رمزنگاری‌شده داخل کوکی HttpOnly ذخیره می‌کند؛ بعد از ثبت، لازم نیست هر بار کلید را وارد کنی و DRO به‌صورت خودکار از کلید همین مرورگر استفاده می‌کند.</p>
    <div style={{marginTop:24,padding:16,borderRadius:14,background:'#07130d',border:'1px solid #183a27'}}>
      <b>{busy?'در حال بررسی…':configured?'● AI KEY CONNECTED':'○ AI KEY NOT SET'}</b>
      {configured&&<div style={{marginTop:8,color:'#8ff5ae'}}>Provider: OpenAI · Key: {masked}</div>}
    </div>
    <label style={{display:'block',marginTop:24,fontWeight:800}}>OpenAI API Key</label>
    <input value={key} onChange={e=>setKey(e.target.value)} type="password" autoComplete="off" placeholder={configured?'برای تعویض کلید، کلید جدید را وارد کن':'sk-…'} style={{width:'100%',boxSizing:'border-box',marginTop:8,padding:14,borderRadius:12,border:'1px solid #27342e',background:'#050806',color:'#fff'}}/>
    <div style={{display:'flex',gap:10,marginTop:14,flexWrap:'wrap'}}>
      <button onClick={()=>void save()} disabled={saving||!key.trim()} style={{padding:'12px 18px',border:0,borderRadius:12,background:'#8ff5ae',color:'#061008',fontWeight:900,cursor:'pointer'}}>{saving?'VERIFYING…':'VERIFY & SAVE'}</button>
      {configured&&<button onClick={()=>void remove()} disabled={saving} style={{padding:'12px 18px',border:'1px solid #513030',borderRadius:12,background:'#170d0d',color:'#ff9d9d',fontWeight:800}}>REMOVE KEY</button>}
    </div>
    {message&&<p style={{color:'#8ff5ae',marginTop:18}}>{message}</p>}
    {error&&<p style={{color:'#ff8f8f',marginTop:18}}>{error}</p>}
    <div style={{marginTop:28,paddingTop:20,borderTop:'1px solid #1c2924',color:'#7f8b86',fontSize:13,lineHeight:1.7}}>
      <b>امنیت:</b> کلید در کد سایت یا GitHub ذخیره نمی‌شود و در پاسخ API هم نمایش داده نمی‌شود. این نسخه کلید را به همین مرورگر/دستگاه متصل می‌کند؛ برای اشتراک بین چند دستگاه، مرحله بعدی می‌تواند حساب کاربری و ذخیره‌سازی رمزنگاری‌شده در دیتابیس باشد.
    </div>
   </div>
  </div>
 </main>
}
