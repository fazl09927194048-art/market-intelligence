import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ ok:false, database:'missing' }, { status:503 });
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
      return NextResponse.json({ ok:false, database:'invalid_protocol' }, { status:503 });
    }
    const pool = new Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 3000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized:false }
    });
    await pool.query('SELECT 1');
    await pool.end();
    return NextResponse.json({ ok:true, database:'connected' });
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as any).code) : 'DB_ERROR';
    return NextResponse.json({ ok:false, database:'unreachable', code }, { status:503 });
  }
}
