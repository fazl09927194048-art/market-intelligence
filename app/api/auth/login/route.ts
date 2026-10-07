import { NextResponse } from 'next/server';
import { loginUser, sessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || '');
    const password = String(body.password || '');
    const result = await loginUser(identifier, password, {
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined
    });
    const response = NextResponse.json({ ok:true, user:result.user });
    response.headers.append('Set-Cookie', sessionCookie(result.token, result.expires));
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ورود انجام نشد';
    return NextResponse.json({ ok:false, error:message }, { status: message.includes('Database') ? 503 : 401 });
  }
}
