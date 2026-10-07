import { NextResponse } from 'next/server';
import { createVerificationCode, findUserForVerification } from '@/lib/auth';

async function sendEmail(to:string, code:string, name:string) {
  const key=process.env.RESEND_API_KEY;
  const from=process.env.AUTH_EMAIL_FROM;
  if(!key || !from) throw new Error('ایمیل OTP هنوز پیکربندی نشده است');
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({
    from,to:[to],subject:'کد تأیید حساب FLI',text:`سلام ${name}\n\nکد تأیید حساب FLI شما: ${code}\n\nاین کد تا ۱۰ دقیقه معتبر است. اگر این درخواست از طرف شما نبوده، آن را نادیده بگیرید.`
  })});
  if(!r.ok) throw new Error('ارسال ایمیل تأیید ناموفق بود');
}
async function sendPhone(to:string) {
  const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN, service=process.env.TWILIO_VERIFY_SERVICE_SID;
  if(!sid || !token || !service) throw new Error('SMS OTP هنوز پیکربندی نشده است');
  const body=new URLSearchParams({To:to,Channel:'sms'});
  const auth=Buffer.from(`${sid}:${token}`).toString('base64');
  const r=await fetch(`https://verify.twilio.com/v2/Services/${service}/Verifications`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok) throw new Error('ارسال پیامک تأیید ناموفق بود');
}
export async function POST(request:Request){
  try{
    const body=await request.json(); const channel=body.channel==='phone'?'phone':'email';
    const user=await findUserForVerification(String(body.identifier||''));
    if(!user) return NextResponse.json({ok:false,error:'حساب پیدا نشد'},{status:404});
    if(channel==='email' && user.emailVerified) return NextResponse.json({ok:true,alreadyVerified:true});
    if(channel==='phone' && user.phoneVerified) return NextResponse.json({ok:true,alreadyVerified:true});
    if(channel==='email'){
      const {code}=await createVerificationCode(user.id,'email');
      await sendEmail(user.email,code,user.name);
    } else {
      if(!user.phone) return NextResponse.json({ok:false,error:'برای این حساب شماره تلفن ثبت نشده است'},{status:400});
      await sendPhone(user.phone);
    }
    return NextResponse.json({ok:true,channel});
  }catch(e){const m=e instanceof Error?e.message:'ارسال کد انجام نشد';return NextResponse.json({ok:false,error:m},{status:m.includes('۶۰')?429:400});}
}
