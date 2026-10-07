import { Pool } from 'pg';
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCb);
const SESSION_COOKIE = 'fli_session';
const SESSION_DAYS = 30;
let pool: Pool | null = null;
let schemaReady = false;

function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  return pool;
}

async function ensureAuthSchema(database: Pool) {
  if (schemaReady) return;
  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email));
    ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users (phone);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip TEXT,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_verification_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('email','phone')),
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  schemaReady = true;
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
};

function normalizeEmail(v: string) { return v.trim().toLowerCase(); }
function normalizePhone(v: string) {
  return v.trim().replace(/[\s().-]/g, '');
}
function validEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validPhone(v: string) { return /^\+?[0-9]{8,16}$/.test(v); }

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieSignature(token: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  return createHmac('sha256', secret).update(token).digest('base64url');
}

export function sessionCookie(token: string, expires: Date) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}.${cookieSignature(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expires.getTime()-Date.now())/1000))}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const part = cookieHeader.split(';').map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE+'='));
  if (!part) return null;
  const raw = part.slice(SESSION_COOKIE.length + 1);
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const token = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const expected = cookieSignature(token);
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch { return null; }
  return token;
}

async function userFromRow(row: any): Promise<AuthUser> {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    emailVerified: Boolean(row.email_verified),
    phoneVerified: Boolean(row.phone_verified),
    createdAt: new Date(row.created_at).toISOString(),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
  };
}

export async function registerUser(input: {name:string; email:string; phone?:string; password:string}) {
  const database = db();
  if (!database) throw new Error('Database is not configured');
  await ensureAuthSchema(database);
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone || '');
  if (name.length < 2 || name.length > 80) throw new Error('نام باید بین ۲ تا ۸۰ کاراکتر باشد');
  if (!validEmail(email)) throw new Error('ایمیل معتبر نیست');
  const normalizedPhone = phone || null;
  if (input.password.length < 8 || input.password.length > 128) throw new Error('رمز عبور باید حداقل ۸ کاراکتر باشد');

  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await database.query(
      `INSERT INTO users(name,email,phone,password_hash)
       VALUES($1,$2,$3,$4)
       RETURNING id,name,email,phone,email_verified,phone_verified,created_at,last_login_at`,
      [name,email,normalizedPhone,passwordHash]
    );
    return userFromRow(rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') throw new Error('این ایمیل یا شماره تلفن قبلاً ثبت شده است');
    throw e;
  }
}

export async function loginUser(identifier: string, password: string, meta?: {ip?:string; userAgent?:string}) {
  const database = db();
  if (!database) throw new Error('Database is not configured');
  await ensureAuthSchema(database);
  const normalized = identifier.includes('@') ? normalizeEmail(identifier) : normalizePhone(identifier);
  const { rows } = await database.query(
    `SELECT id,name,email,phone,password_hash,email_verified,phone_verified,created_at,last_login_at
     FROM users WHERE LOWER(email)=LOWER($1) OR (phone IS NOT NULL AND phone=$1) LIMIT 1`, [normalized]
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) throw new Error('اطلاعات ورود نادرست است');

  await database.query('UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1', [row.id]);
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await database.query(
    `INSERT INTO auth_sessions(user_id,token_hash,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5)`,
    [row.id, tokenHash(token), expires, meta?.ip?.slice(0,128) || null, meta?.userAgent?.slice(0,512) || null]
  );
  return { user: await userFromRow({...row,last_login_at:new Date()}), token, expires };
}

export async function getCurrentUser(cookieHeader: string | null) {
  const database = db();
  const token = readSessionToken(cookieHeader);
  if (database) await ensureAuthSchema(database);
  if (!database || !token) return null;
  const { rows } = await database.query(
    `SELECT u.id,u.name,u.email,u.phone,u.email_verified,u.phone_verified,u.created_at,u.last_login_at
     FROM auth_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW() LIMIT 1`, [tokenHash(token)]
  );
  if (!rows[0]) return null;
  await database.query('UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=$1', [tokenHash(token)]).catch(()=>{});
  return userFromRow(rows[0]);
}

export async function logoutUser(cookieHeader: string | null) {
  const database = db();
  const token = readSessionToken(cookieHeader);
  if (database && token) await database.query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash(token)]);
}

export function authCookieName() { return SESSION_COOKIE; }

function verificationCodeHash(code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  return createHmac('sha256', secret).update(code).digest('hex');
}
function newVerificationCode() { return String(randomInt(100000, 1000000)); }
export async function createVerificationCode(userId: string, channel: 'email'|'phone') {
  const database=db(); if(!database) throw new Error('Database is not configured'); await ensureAuthSchema(database);
  const latest=await database.query(`SELECT created_at FROM auth_verification_codes WHERE user_id=$1 AND channel=$2 ORDER BY created_at DESC LIMIT 1`,[userId,channel]);
  if(latest.rows[0] && Date.now()-new Date(latest.rows[0].created_at).getTime()<60000) throw new Error('لطفاً برای ارسال کد جدید ۶۰ ثانیه صبر کنید');
  const code=newVerificationCode(), expires=new Date(Date.now()+10*60*1000);
  await database.query(`UPDATE auth_verification_codes SET consumed_at=NOW() WHERE user_id=$1 AND channel=$2 AND consumed_at IS NULL`,[userId,channel]);
  await database.query(`INSERT INTO auth_verification_codes(user_id,channel,code_hash,expires_at) VALUES($1,$2,$3,$4)`,[userId,channel,verificationCodeHash(code),expires]);
  return {code,expires};
}
export async function verifyVerificationCode(userId:string, channel:'email'|'phone', code:string) {
  const database=db(); if(!database) throw new Error('Database is not configured'); await ensureAuthSchema(database);
  if(!/^\d{6}$/.test(code)) throw new Error('کد تأیید باید ۶ رقمی باشد');
  const {rows}=await database.query(`SELECT id,code_hash,expires_at,attempts FROM auth_verification_codes WHERE user_id=$1 AND channel=$2 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`,[userId,channel]);
  const row=rows[0]; if(!row) throw new Error('کد تأیید یافت نشد');
  if(new Date(row.expires_at).getTime()<=Date.now()) throw new Error('کد تأیید منقضی شده است');
  if(Number(row.attempts)>=5) throw new Error('تعداد تلاش‌ها تمام شده است');
  if(verificationCodeHash(code)!==row.code_hash){await database.query('UPDATE auth_verification_codes SET attempts=attempts+1 WHERE id=$1',[row.id]);throw new Error('کد تأیید نادرست است');}
  await database.query('UPDATE auth_verification_codes SET consumed_at=NOW() WHERE id=$1',[row.id]);
  const verifiedColumn = channel==='email' ? 'email_verified' : 'phone_verified';
  await database.query(`UPDATE users SET ${verifiedColumn}=TRUE,updated_at=NOW() WHERE id=$1`,[userId]);
  return true;
}
export async function findUserForVerification(identifier:string) {
  const database=db(); if(!database) throw new Error('Database is not configured'); await ensureAuthSchema(database);
  const normalized=identifier.includes('@')?normalizeEmail(identifier):normalizePhone(identifier);
  const {rows}=await database.query(`SELECT id,name,email,phone,email_verified,phone_verified,created_at,last_login_at FROM users WHERE LOWER(email)=LOWER($1) OR phone=$1 LIMIT 1`,[normalized]);
  return rows[0]?userFromRow(rows[0]):null;
}
