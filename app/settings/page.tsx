'use client';

import React from 'react';

export default function SettingsPage(){
  return <div style={{minHeight:'100vh',background:'#06080c',color:'#e8edf2',padding:'28px 18px',fontFamily:'system-ui,sans-serif'}}>
    <div style={{maxWidth:760,margin:'0 auto'}}>
      <a href="/" style={{color:'#8ff5ae',textDecoration:'none',fontWeight:800}}>← MARKET/INTEL</a>
      <div style={{marginTop:38,border:'1px solid #1c2924',borderRadius:20,padding:'28px',background:'#0b1110'}}>
        <div style={{fontSize:12,color:'#8ff5ae',fontWeight:900,letterSpacing:2}}>DRO SETTINGS</div>
        <h1 style={{fontSize:32,margin:'8px 0'}}>Independent DRO</h1>
        <p style={{color:'#9aa59f',lineHeight:1.8}}>
          در این نسخه DRO برای کارکرد اصلی خود به API Key خارجی نیاز ندارد. موتور داخلی خودش داده بازار، تحلیل تکنیکال،
          چندتایم‌فریم، جریان سفارش، مشتقات، اخبار، سناریوها، ریسک، ۳۳ تحلیلگر تخصصی، حافظه پیش‌بینی و گیت ابطال را اجرا می‌کند.
        </p>
        <div style={{marginTop:24,padding:18,borderRadius:14,background:'#07130d',border:'1px solid #183a27'}}>
          <b style={{color:'#8ff5ae'}}>● DRO INTERNAL ENGINE — ACTIVE</b>
          <p style={{margin:'10px 0 0',color:'#9aa59f'}}>API Key خارجی: لازم نیست · Provider: Internal Intelligence Engine</p>
        </div>
        <div style={{marginTop:22,padding:16,borderRadius:14,background:'#090d12',border:'1px solid #202b33',lineHeight:1.8,color:'#9aa59f'}}>
          <b style={{color:'#e8edf2'}}>معماری فعلی</b><br/>
          Market Data → Technical/Flow/Derivatives → 33 Specialist Analysts → Consensus → Scenarios → Risk → Invalidation → DRO Decision Layer
        </div>
        <div style={{display:'flex',gap:10,marginTop:24,flexWrap:'wrap'}}>
          <a href="/ai" style={{padding:'12px 18px',borderRadius:12,background:'#8ff5ae',color:'#061008',fontWeight:900,textDecoration:'none'}}>OPEN DRO</a>
          <a href="/" style={{padding:'12px 18px',border:'1px solid #27342e',borderRadius:12,color:'#e8edf2',fontWeight:800,textDecoration:'none'}}>DASHBOARD</a>
        </div>
        <div style={{marginTop:28,paddingTop:20,borderTop:'1px solid #1c2924',color:'#7f8b86',fontSize:13,lineHeight:1.7}}>
          کلیدهای خارجی در این نسخه در جریان اصلی DRO استفاده نمی‌شوند. اگر بعداً مدل خارجی اضافه شود، به‌صورت یک Provider اختیاری و جداگانه اضافه خواهد شد.
        </div>
      </div>
    </div>
  </div>
}
