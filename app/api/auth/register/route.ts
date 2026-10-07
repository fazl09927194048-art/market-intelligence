import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await registerUser({
      name: String(body.name || ''),
      email: String(body.email || ''),
      phone: undefined,
      password: String(body.password || '')
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ثبت‌نام انجام نشد';
    const status = message.includes('قبلاً') ? 409 : message.includes('Database') ? 503 : 400;
    return NextResponse.json({ ok:false, error:message }, { status });
  }
}
