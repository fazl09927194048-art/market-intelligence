'use client';
import React,{useEffect,useMemo,useState} from 'react';
type Props={symbol:string;interval:string;context:unknown;fa?:boolean};

type ExtensionSnapshot={symbol?:string;interval?:string;pagePrice?:number|null;price?:number|null;signal?:unknown;forecast?:unknown;consensus?:unknown;risk?:unknown;multiTimeframe?:unknown;chartPatterns?:unknown;marketData?:unknown;news?:unknown[];events?:unknown[];warnings?:string[];observedAt?:string;extraction?:string};

export default function AIChat({symbol,interval,context,fa=false}:Props){
 const [open,setOpen]=useState(false),[input,setInput]=useState(''),[answer,setAnswer]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[extensionEnabled,setExtensionEnabled]=useState(true),[extension,setExtension]=useState<ExtensionSnapshot|null>(null);
 const readExtension=()=>{try{const raw=document.documentElement.getAttribute('data-dro-extension-context');if(raw)setExtension(JSON.parse(raw));else setExtension(null);}catch{setExtension(null);}};
 useEffect(()=>{try{const saved=window.localStorage.getItem('dro-ai-extension-enabled');if(saved!==null)setExtensionEnabled(saved==='1');}catch{};readExtension();const onEvent=()=>readExtension();window.addEventListener('dro-extension-context',onEvent);return()=>window.removeEventListener('dro-extension-context',onEvent)},[]);
 useEffect(()=>{document.documentElement.setAttribute('data-dro-ai-extension',extensionEnabled?'on':'off');try{window.localStorage.setItem('dro-ai-extension-enabled',extensionEnabled?'1':'0');}catch{}},[extensionEnabled]);
 useEffect(()=>{if(!open)return;setStatus('Checking AI connection…');fetch('/api/chat',{cache:'no-store'}).then(r=>r.json()).then(d=>setStatus(d.configured?(extensionEnabled?'AI online · DRO extension '+(extension?'LIVE':'ready'):'AI online · extension off'):'AI server key missing')).catch(()=>setStatus('AI connection unavailable'));},[open,extensionEnabled,extension]);
 const mergedContext=useMemo(()=>({symbol,interval,liveContext:context,extension:extensionEnabled?extension:null}),[symbol,interval,context,extensionEnabled,extension]);
 const toggleExtension=()=>{setExtensionEnabled(v=>!v);setError('');setStatus(!extensionEnabled?'DRO extension activated':'DRO extension deactivated');};
 const send=async()=>{const message=input.trim();if(!message||busy)return;setBusy(true);setError('');setStatus(fa?'در حال تحلیل و دریافت پاسخ…':'Analyzing and receiving response…');setAnswer('');try{let r:Response|null=null;let d:any=null;for(let attempt=0;attempt<3;attempt++){try{r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,context:JSON.stringify(mergedContext),extensionContext:extensionEnabled?JSON.stringify(extension||{}):'',extensionEnabled}),cache:'no-store'});d=await r.json();}catch(e){if(attempt===2)throw e;await new Promise(x=>setTimeout(x,350*(attempt+1)));continue;}if(r.ok)break;if(r.status===429&&attempt<2){await new Promise(x=>setTimeout(x,1200*(attempt+1)));continue;}if(![500,502,503,504].includes(r.status)||attempt===2)break;await new Promise(x=>setTimeout(x,600*(attempt+1)));}if(!r?.ok){const err=new Error(d?.error||'AI unavailable');(err as any).retryable=d?.retryable;throw err;}setAnswer(d.text||'No response');setInput('');setStatus(fa?`پاسخ دریافت شد${extensionEnabled?' · DRO فعال':''}:`:`Response received${extensionEnabled?' · DRO active':''}`);}catch(e){setError(e instanceof Error?e.message:'AI unavailable');setStatus(fa?'خطا در ارتباط با AI':'AI communication error')}finally{setBusy(false)}};
 const change=(e:React.ChangeEvent<HTMLTextAreaElement>)=>setInput(e.currentTarget.value);
 const key=(e:React.KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}};
 return React.createElement(React.Fragment,null,
  React.createElement('button',{className:'aiFab',onClick:()=>setOpen(!open),title:'DRO AI'},open?'×':'AI'),
  open&&React.createElement('aside',{className:'aiChat',dir:fa?'rtl':'ltr'},
   React.createElement('div',{className:'aiHead'},React.createElement('div',null,React.createElement('b',null,'DRO AI'),React.createElement('small',null,`${symbol} · ${interval} · ${extensionEnabled?'extension active':'extension off'}`)),React.createElement('button',{onClick:()=>setOpen(false)},'×')),
   React.createElement('div',{className:'aiBody'},React.createElement('small',{className:'muted'},status),answer?React.createElement('div',{className:'aiAnswer'},answer):React.createElement('p',{className:'muted'},fa?'درباره همین تحلیل زنده سؤال بپرس.':'Ask DRO about the current live analysis.'),extensionEnabled&&extension&&React.createElement('div',{className:'droExtContext'},React.createElement('b',null,'DRO EXTENSION · LIVE'),React.createElement('span',null,`${extension.symbol||symbol} · ${extension.extraction||'stream'} · ${extension.observedAt?new Date(extension.observedAt).toLocaleTimeString():''}`)),error&&React.createElement('p',{className:'down'},error)),
   React.createElement('div',{className:'aiInput'},
    React.createElement('textarea',{value:input,onChange:change,onKeyDown:key,placeholder:fa?'پیام خود را بنویسید…':'Ask DRO…'}),
    React.createElement('div',{className:'aiInputActions'},
     React.createElement('button',{className:`droToggle ${extensionEnabled?'active':''}`,onClick:toggleExtension,title:extensionEnabled?'Disable DRO extension context':'Enable DRO extension context','aria-label':extensionEnabled?'Disable DRO extension':'Enable DRO extension'},React.createElement('span',{className:'droTreeIcon'},'♧'),React.createElement('span',null,extensionEnabled?'DRO':'OFF')),
     React.createElement('button',{className:'sendBtn',onClick:()=>void send(),disabled:busy||!input.trim()},busy?'…':fa?'ارسال':'Send')
    )
   )
  )
 );
}
