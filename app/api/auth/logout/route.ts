import { NextResponse } from 'next/server';
import { clearSessionCookie, logoutUser } from '@/lib/auth';

export async function POST(request: Request) {
  await logoutUser(request.headers.get('cookie'));
  const response = NextResponse.json({ ok:true });
  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
}
