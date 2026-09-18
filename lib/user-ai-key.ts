import crypto from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'dro_ai_key';
const SECRET_ENV = 'DRO_KEY_ENCRYPTION_SECRET';

function secret() {
  const value = process.env[SECRET_ENV];
  if (!value || value.length < 32) throw new Error(`${SECRET_ENV} is not configured securely`);
  return crypto.createHash('sha256').update(value).digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function decrypt(value: string) {
  try {
    const raw = Buffer.from(value, 'base64url');
    if (raw.length < 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export async function getUserAIKey() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  return value ? decrypt(value) : null;
}

export async function saveUserAIKey(key: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, encrypt(key.trim()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearUserAIKey() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function maskAIKey(key: string | null) {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
