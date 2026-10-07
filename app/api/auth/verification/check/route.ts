import { NextResponse } from 'next/server';
import { findUserForVerification, verifyVerificationCode } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const channel = body.channel === 'phone' ? 'phone' : 'email';
    const identifier = String(body.identifier || '').trim();
    const code = String(body.code || '').trim();

    const user = await findUserForVerification(identifier);
    if (!user) return NextResponse.json({ ok: false, error: 'حساب پیدا نشد' }, { status: 404 });

    if (channel === 'email') {
      await verifyVerificationCode(user.id, 'email', code);
    } else {
      const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN, service=process.env.TWILIO_VERIFY_SERVICE_SID;
      if(!sid || !token || !service) return NextResponse.json({ok:false,error:'SMS OTP هنوز پیکربندی نشده است'},{status:501});
      const bodyParams=new URLSearchParams({To:user.phone,Code:code});
      const auth=Buffer.from(`${sid}:${token}`).toString('base64');
      const r=await fetch(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:bodyParams});
      if(!r.ok) return NextResponse.json({ok:false,error:'تأیید پیامک ناموفق بود'},{status:400});
      const result=await r.json();
      if(result.status!=='approved') return NextResponse.json({ok:false,error:'کد تأیید نادرست است'},{status:400});
    }
    return NextResponse.json({ ok: true, channel });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'تأیید کد انجام نشد';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
