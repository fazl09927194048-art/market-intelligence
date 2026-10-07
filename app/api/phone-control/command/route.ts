import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth';
import {createAction} from '@/lib/dro-phone-control';
function plan(message:string){
 const m=message.trim().toLowerCase();
 if(/\b(back|برگرد|عقب)\b/.test(m))return {actionType:'press_back',payload:{}};
 if(/\b(home|خانه)\b/.test(m))return {actionType:'press_home',payload:{}};
 if(/\b(recent|برنامه قبلی|برنامه‌های قبلی)\b/.test(m))return {actionType:'recent',payload:{}};
 if(/screenshot|اسکرین|عکس از صفحه/.test(m))return {actionType:'screenshot',payload:{}};
 if(/scroll|پایین بکش|صفحه رو پایین/.test(m))return {actionType:'scroll',payload:{direction:'down',amount:0.7}};
 if(/بالا بکش|scroll up/.test(m))return {actionType:'scroll',payload:{direction:'up',amount:0.7}};
 return null;
}
export async function POST(req:NextRequest){
 const u=await getCurrentUser(req.headers.get('cookie'));if(!u)return NextResponse.json({ok:false,error:'AUTH_REQUIRED'},{status:401});
 const b=await req.json().catch(()=>({})); const message=String(b?.message||'').slice(0,2000); if(!message)return NextResponse.json({ok:false,error:'MESSAGE_REQUIRED'},{status:400});
 if(!b?.sessionId)return NextResponse.json({ok:false,error:'SESSION_REQUIRED'},{status:400});
 const p=plan(message);
 if(!p)return NextResponse.json({ok:true,planned:false,text:'DRO هنوز برای این فرمان نیاز به Screen + UI Tree دارد؛ فرمان را فعلاً اجرا نمی‌کنم تا هدف دقیق روی صفحه تأیید شود.'});
 if(String(b.mode||'ASSIST').toUpperCase()==='ASSIST'&&!b.confirmed)return NextResponse.json({ok:false,requiresConfirmation:true,planned:true,plan:p,text:'این فرمان کنترل گوشی است. برای اجرا تأیید کن.'},{status:409});
 const action=await createAction(u.id,String(b.sessionId),p.actionType,p.payload,typeof b.idempotencyKey==='string'?b.idempotencyKey.slice(0,160):undefined);
 return NextResponse.json({ok:true,planned:true,action});
}