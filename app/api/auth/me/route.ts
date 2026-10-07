import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getCurrentUser(request.headers.get('cookie'));
  return NextResponse.json({ ok:true, authenticated:Boolean(user), user });
}
