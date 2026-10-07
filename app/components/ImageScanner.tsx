'use client';
import React,{useState} from 'react';

export default function ImageScanner({symbol,interval,fa}:{symbol:string;interval:string;fa:boolean}){
  const [imageData,setImageData]=useState('');
  const [result,setResult]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const read=(file:File)=>{
    if(!file.type.startsWith('image/')){setError(fa?'فقط فایل تصویر مجاز است.':'Only image files are supported.');return;}
    if(file.size>10*1024*1024){setError(fa?'حجم تصویر نباید بیشتر از ۱۰ مگابایت باشد.':'Image must be 10MB or smaller.');return;}
    setError('');setResult(null);
    const reader=new FileReader();
    reader.onload=()=>setImageData(String(reader.result||''));
    reader.readAsDataURL(file);
  };
  const scan=async()=>{
    if(!imageData)return;
    setLoading(true);setError('');
    try{
      const res=await fetch('/api/image-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageData,symbol,interval})});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error||'IMAGE_SCAN_FAILED');
      setResult(data);
    }catch(e){setError(e instanceof Error?e.message:'IMAGE_SCAN_FAILED')}
    finally{setLoading(false)}
  };
  const img=result?.image||null, plan=result?.imageTradePlan||null, analysis=result?.analysis||null;
  return <section className="section imageScanner" id="image-scan">
    <div className="sectionHead"><h2>{fa?'اسکن کامل نمودار':'FULL CHART SCAN'}</h2><small>{fa?'تصویر → بینایی → ۳۳ تحلیلگر → DRO':'IMAGE → VISION → 33 ANALYSTS → DRO'}</small></div>
    <div className="body">
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];if(f)read(f)}} />
      {imageData&&<img src={imageData} alt="Chart preview" style={{maxWidth:'100%',maxHeight:420,display:'block',margin:'14px 0',borderRadius:12}} />}
      <button className="deep" onClick={scan} disabled={!imageData||loading}>{loading?(fa?'در حال اسکن…':'SCANNING…'):(fa?'اسکن تصویر':'SCAN IMAGE')}</button>
      {error&&<p className="bullet">{error}</p>}
      {img&&<div className="statGrid" style={{marginTop:16}}>
        <article><small>DIRECTION</small><strong>{img.direction||'UNKNOWN'}</strong><span>{Number(img.confidence||0)}% confidence</span></article>
        <article><small>VISUAL QUALITY</small><strong>{img.visualQuality??'—'}</strong><span>{img.timeframe||interval}</span></article>
        <article><small>STRUCTURE</small><strong>{img.marketStructure||'—'}</strong><span>{img.trend||'—'}</span></article>
        <article><small>PLAN</small><strong>{plan?.status||'—'}</strong><span>{plan?.riskReward?'R:R '+plan.riskReward:'—'}</span></article>
      </div>}
      {analysis&&<div className="body" style={{marginTop:16}}>
        <p><b>{fa?'تصمیم DRO: ':'DRO DECISION: '}</b>{analysis.tradePlan?.side||'NO TRADE'} · {analysis.tradePlan?.confidence??analysis.consensus?.confidence??0}%</p>
        <p>{fa?'ورود: ':'Entry: '}{analysis.tradePlan?.entry??'—'} · SL: {analysis.tradePlan?.stopLoss??'—'} · TP: {analysis.tradePlan?.takeProfit??'—'}</p>
        <p>{fa?'وضعیت ابطال: ':'Invalidation: '}{analysis.invalidation?.status||'—'}</p>
        <p className="muted">{analysis.tradePlan?.analysis||''}</p>
      </div>}
    </div>
  </section>;
}
