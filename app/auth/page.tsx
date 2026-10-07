'use client';
import React,{useEffect,useState} from 'react';
import Link from 'next/link';

type User={id:string;name:string;email:string;phone:string;emailVerified:boolean;phoneVerified:boolean;createdAt:string;lastLoginAt?:string|null};

export default function AuthPage(){
  const [mode,setMode]=useState<'login'|'register'>('register');
  const [user,setUser]=useState<User|null>(null);
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [phone,setPhone]=useState('');const [password,setPassword]=useState('');const [identifier,setIdentifier]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=async()=>{const r=await fetch('/api/auth/me',{cache:'no-store'});const j=await r.json();if(j.authenticated)setUser(j.user)};
  useEffect(()=>{load()},[]);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{
    const endpoint=mode==='register'?'/api/auth/register':'/api/auth/login';
    const payload=mode==='register'?{name,email,phone,password}:{identifier,password};
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'خطا');
    if(mode==='register'){setMode('login');setIdentifier(email);setPassword('');setError('ثبت‌نام انجام شد؛ حالا وارد حساب شو.')}else setUser(j.user);
  }catch(e){setError(e instanceof Error?e.message:'خطا')}finally{setBusy(false)}};
  const logout=async()=>{await fetch('/api/auth/logout',{method:'POST'});setUser(null)};
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#07090d',color:'#f4f7fb',fontFamily:'system-ui'}}>
    <section style={{width:'100%',maxWidth:520,border:'1px solid #202630',borderRadius:24,padding:28,background:'#0d1118',boxShadow:'0 20px 80px #0008'}}>
      <Link href="/" style={{color:'#9aa6b2',textDecoration:'none'}}>← FLI / DRO</Link>
      <h1 style={{fontSize:32,margin:'22px 0 8px'}}>حساب FLI</h1>
      {user?<><p style={{color:'#9aa6b2'}}>حساب شما فعال است.</p><div style={{display:'grid',gap:10,marginTop:22}}>{[['نام',user.name],['ایمیل',user.email],['شماره تلفن',user.phone]].map(([k,v])=><div key={k} style={{padding:14,border:'1px solid #242b36',borderRadius:14}}><small style={{color:'#7f8a98'}}>{k}</small><div>{v}</div></div>)}</div><button onClick={logout} style={{marginTop:18,width:'100%',padding:13,borderRadius:12,border:0,cursor:'pointer'}}>خروج</button></>
      :<><div style={{display:'flex',gap:8,margin:'20px 0'}}><button onClick={()=>{setMode('register');setError('')}} style={{flex:1,padding:12,borderRadius:12,border:'1px solid #303846',background:mode==='register'?'#1a2230':'transparent',color:'#fff'}}>ثبت‌نام</button><button onClick={()=>{setMode('login');setError('')}} style={{flex:1,padding:12,borderRadius:12,border:'1px solid #303846',background:mode==='login'?'#1a2230':'transparent',color:'#fff'}}>ورود</button></div>
      <form onSubmit={submit} style={{display:'grid',gap:12}}>{mode==='register'&&<><input required minLength={2} maxLength={80} placeholder="نام و نام خانوادگی" value={name} onChange={e=>setName(e.target.value)}/><input required type="email" placeholder="ایمیل" value={email} onChange={e=>setEmail(e.target.value)}/><input required inputMode="tel" placeholder="+98... شماره تلفن" value={phone} onChange={e=>setPhone(e.target.value)}/></>} {mode==='login'&&<input required placeholder="ایمیل یا شماره تلفن" value={identifier} onChange={e=>setIdentifier(e.target.value)}/>}<input required minLength={8} type="password" placeholder="رمز عبور (حداقل ۸ کاراکتر)" value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy} style={{padding:14,border:0,borderRadius:12,cursor:'pointer'}}>{busy?'در حال پردازش…':mode==='register'?'ساخت حساب':'ورود به حساب'}</button></form>
      {error&&<p style={{marginTop:14,color:error.includes('انجام شد')?'#7ee2a8':'#ff8d8d'}}>{error}</p>}<p style={{marginTop:18,color:'#707b89',fontSize:13}}>ایمیل و شماره تلفن فعلاً ذخیره می‌شوند؛ وضعیت تأیید تا اتصال سرویس OTP جداگانه «تأییدنشده» باقی می‌ماند.</p></>}
    </section>
  </main>
}
