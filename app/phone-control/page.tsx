'use client';
import React,{useEffect,useRef,useState}from'react';

type Overview={configured:boolean;device:any;session:any};
export default function PhoneControlPage(){
 const [o,setO]=useState<Overview|null>(null),[loading,setLoading]=useState(true),[pair,setPair]=useState(''),[mode,setMode]=useState('ASSIST'),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[command,setCommand]=useState(''),[confirm,setConfirm]=useState<any>(null);
 const [rtc,setRtc]=useState('OFFLINE'),[stats,setStats]=useState({fps:'—',latency:'—',battery:'—',resolution:'—'}),[iceServers,setIceServers]=useState<RTCIceServer[]>([]);
 const videoRef=useRef<HTMLVideoElement|null>(null),pcRef=useRef<RTCPeerConnection|null>(null),seenRef=useRef<Set<string>>(new Set()),reconnectRef=useRef(0),autoStartRef=useRef(false);

 const load=async()=>{setLoading(true);try{const r=await fetch('/api/phone-control/session',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'AUTH_REQUIRED');setO(j);if(j.device&&!j.session&&!autoStartRef.current){autoStartRef.current=true;const sr=await fetch('/api/phone-control/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',mode:'ASSIST'})});const sj=await sr.json();if(sr.ok&&sj.session){setO((x:any)=>x?{...x,session:sj.session}:x);setMsg('PHONE SESSION AUTO-STARTED')}else if(!sr.ok){setMsg(sj.error||'AUTO_START_FAILED')}}}catch(e){setMsg(e instanceof Error?e.message:'FAILED')}finally{setLoading(false)}};
 useEffect(()=>{load();const t=setInterval(load,5000);return()=>clearInterval(t)},[]);

 async function signal(payload:any){if(!o?.session?.session_id)return;await fetch('/api/phone-control/webrtc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:o.session.session_id,payload})})}
 async function startRtc(){
   if(!o?.session?.session_id)return;
   let configuredIceServers:RTCIceServer[]=iceServers.length?iceServers:[{urls:'stun:stun.l.google.com:19302'}];
   try{const cr=await fetch('/api/phone-control/webrtc/config',{cache:'no-store'});const cj=await cr.json();
     if(cj.ok&&Array.isArray(cj.servers)&&cj.servers.length){configuredIceServers=cj.servers;setIceServers(cj.servers)}
   }catch{}

   pcRef.current?.close(); seenRef.current.clear();
   const pc=new RTCPeerConnection({iceServers:configuredIceServers});
   pcRef.current=pc; reconnectRef.current=0; setRtc('CONNECTING');\n   const control=pc.createDataChannel('dro-control');\n   const sendQuality=(width:number,height:number,fps:number)=>{if(control.readyState==='open')control.send(JSON.stringify({type:'quality',width,height,fps}))};\n   control.onopen=()=>sendQuality(720,1280,15);
   pc.ontrack=e=>{if(videoRef.current&&e.streams[0]){videoRef.current.srcObject=e.streams[0];videoRef.current.play().catch(()=>{})}};
   pc.onicecandidate=e=>{if(e.candidate)signal({candidate:{candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex}})};
   pc.onconnectionstatechange=()=>{setRtc(pc.connectionState.toUpperCase());if((pc.connectionState==='failed'||pc.connectionState==='disconnected')&&reconnectRef.current<5&&!stopped){reconnectRef.current++;setTimeout(()=>{if(pcRef.current===pc&&!stopped)startRtc()},4000)}};
   let restartTimer:any=null;
   let stopped=false;
   let pollTimer:any=null;
   let statTimer:any=null;
   pc.oniceconnectionstatechange=()=>{const s=pc.iceConnectionState;if(s==='failed'||s==='disconnected'){if(restartTimer)return;restartTimer=setTimeout(async()=>{restartTimer=null;try{pc.restartIce();const offer=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(offer);await signal({sdp:{type:'offer',sdp:offer.sdp,iceRestart:true}});setRtc('ICE_RESTARTING')}catch{}},1500)}};
   const poll=async()=>{if(pcRef.current!==pc||stopped)return;try{
     const r=await fetch('/api/phone-control/webrtc?sessionId='+encodeURIComponent(o.session.session_id),{cache:'no-store'});const j=await r.json();
     for(const s of (j.signals||[])){if(seenRef.current.has(s.id))continue;seenRef.current.add(s.id);const p=s.payload||{};
       if(p.sdp?.type==='offer'){await pc.setRemoteDescription({type:'offer',sdp:p.sdp.sdp});const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal({sdp:{type:'answer',sdp:answer.sdp}})}
       if(p.candidate?.candidate){try{await pc.addIceCandidate(p.candidate)}catch{}}
     }
   }catch{} if(!stopped&&pcRef.current===pc)pollTimer=setTimeout(poll,800)};poll();
   statTimer=setInterval(async()=>{if(pcRef.current!==pc||stopped){clearInterval(statTimer);return}try{
     const rs=await pc.getStats();rs.forEach((v:any)=>{if(v.type==='inbound-rtp'&&v.kind==='video'){
       const fps=v.framesPerSecond??v.framesDecoded;const w=v.frameWidth,h=v.frameHeight;
       setStats(x=>({...x,fps:fps?String(Math.round(fps)):'—',resolution:w&&h?w+'×'+h:x.resolution,latency:v.jitter?Math.round(v.jitter*1000)+' ms':x.latency}))
     }})
   }catch{}},2000);
 }
 useEffect(()=>{if(o?.session?.session_id)startRtc();return()=>{const pc:any=pcRef.current;if(pc?.__cleanup)pc.__cleanup();pc?.close();pcRef.current=null}},[o?.session?.session_id]);

 async function pairing(){setBusy(true);setMsg('');try{const r=await fetch('/api/phone-control/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pairing-code'})});const j=await r.json();if(!r.ok)throw new Error(j.error||'FAILED');setPair(j.code)}catch(e){setMsg(e instanceof Error?e.message:'FAILED')}finally{setBusy(false)}}
 async function start(){setBusy(true);setMsg('');try{const r=await fetch('/api/phone-control/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',mode})});const j=await r.json();if(!r.ok)throw new Error(j.error||'FAILED');setO(x=>x?{...x,session:j.session}:x);setMsg('PHONE SESSION CREATED')}catch(e){setMsg(e instanceof Error?e.message:'FAILED')}finally{setBusy(false)}}
 async function stop(){pcRef.current?.close();pcRef.current=null;await fetch('/api/phone-control/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'emergency-stop'})});setRtc('STOPPED');autoStartRef.current=true;setMsg('EMERGENCY STOP ACTIVE');await load()}
 async function send(confirmed=false){if(!command.trim()||!o?.session?.session_id)return;const r=await fetch('/api/phone-control/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:command,sessionId:o.session.session_id,mode,confirmed})});const j=await r.json();if(j.requiresConfirmation){setConfirm(j);return}setMsg(j.text||(j.action?'ACTION QUEUED':'DRO RECEIVED'));setCommand('');setConfirm(null)}

 return <main className="phoneControl"><header><a href="/settings">← Settings</a><div><small>FLI / DRO</small><h1>DRO PHONE CONTROL</h1><p>کنترل امن گوشی اندروید با DRO</p></div><button onClick={stop}>EMERGENCY STOP</button></header>
 <div className="phoneLayout"><section className="phoneScreen"><div className="screenTop"><b>LIVE ANDROID SCREEN</b><span>{rtc}</span></div><div className="screenViewport"><video ref={videoRef} autoPlay playsInline muted className="phoneLiveVideo"/>{rtc!=='CONNECTED'&&<div className="screenPlaceholder"><strong>📱</strong><b>{loading?'Loading…':'Waiting for live screen'}</b><small>{o?.device?'Android Companion connected. Start screen sharing on the phone.':'Pair the Android Companion first.'}</small></div>}</div><div className="phoneStats"><span>FPS <b>{stats.fps}</b></span><span>LATENCY <b>{stats.latency}</b></span><span>BATTERY <b>{o?.device?.battery??'—'}</b></span><span>RESOLUTION <b>{stats.resolution}</b></span></div><div className="phoneActions"><button onClick={()=>send(true)}>‹</button><button onClick={()=>send(true)}>⌂</button><button onClick={()=>send(true)}>▣</button><button onClick={()=>{setCommand('از صفحه عکس بگیر');send()}}>SCREENSHOT</button></div></section>
 <section className="droPhoneChat"><div className="chatHead"><div><b>DRO</b><small>Observe → Assist → Autonomous</small></div><select value={mode}onChange={e=>setMode(e.target.value)}><option>OBSERVE</option><option>ASSIST</option><option>AUTONOMOUS</option></select></div><div className="chatBody"><div className="chatMsg"><b>DRO</b><p>{o?.device?'دستگاه مورد اعتماد آماده است. اگر Screen Capture فعال باشد، اتصال Live به‌صورت خودکار برقرار می‌شود.':'هنوز دستگاه مورد اعتمادی جفت نشده است.'}</p></div>{msg&&<div className="chatMsg"><b>SYSTEM</b><p>{msg}</p></div>}</div><div className="chatInput"><input value={command}onChange={e=>setCommand(e.target.value)}onKeyDown={e=>{if(e.key==='Enter')send()}}placeholder="مثلاً: برگرد عقب"/><button onClick={()=>send()}>ارسال</button>{confirm&&<div className="chatMsg"><b>CONFIRMATION</b><p>{confirm.text}</p><button onClick={()=>send(true)}>تأیید اجرا</button></div>}</div></section></div>
 <section className="setupCard"><h2>One-time setup</h2>{o?.device?<><p>✓ دستگاه {o.device.name} قبلاً Trust شده. با ورود به این صفحه، session گوشی به‌صورت خودکار ساخته می‌شود. Screen Capture همچنان باید توسط خود Android تأیید شده باشد.</p><button onClick={start}disabled={busy}>RESTART PHONE SESSION</button></>:<><p>۱) اپ xXx DRO را نصب کن. ۲) کد زیر را داخل اپ وارد کن. ۳) مجوزهای Android را فقط یک‌بار تأیید کن.</p><button onClick={pairing}disabled={busy}>{pair?'PAIRING CODE: '+pair:'GENERATE PAIRING CODE'}</button></>}</section>
 </main>
}