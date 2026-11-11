import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { VALID_SELLERS, isGestao } from './helpers';

export const DEFAULT_PINS: Record<string, string> = {
  Pedro: '3220', Daniel: '3220', Igor: '3220', Ricardo: '1234', Wanderley: '1234',
};

export function hashPin(pin: string, salt?: string) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), s, 32).toString('hex');
  return { salt: s, hash };
}
export function verifyPin(pin: string, salt: string, hash: string) {
  try {
    const h = crypto.scryptSync(String(pin), salt, 32);
    const b = Buffer.from(hash, 'hex');
    return b.length === h.length && crypto.timingSafeEqual(h, b);
  } catch { return false; }
}

const COOKIE = 'vv_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

export function signSession(secret: string, name: string, pinVersion: number) {
  const payload = Buffer.from(JSON.stringify({ n: name, v: pinVersion, e: Date.now() + MAX_AGE_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function readSession(secret: string, token?: string): { n: string; v: number } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!d.n || d.e < Date.now() || !(VALID_SELLERS as readonly string[]).includes(d.n)) return null;
    return { n: d.n, v: d.v ?? 0 };
  } catch { return null; }
}
export function parseCookies(h?: string): Record<string, string> {
  const out: Record<string, string> = {};
  (h || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
export function setSessionCookie(res: Response, token: string, secure: boolean) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_MS / 1000}${secure ? '; Secure' : ''}`);
}
export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
export const COOKIE_NAME = COOKIE;

declare module 'express-serve-static-core' {
  interface Request { user?: string }
}

export function requireGestao(req: Request, res: Response, next: NextFunction) {
  if (!isGestao(req.user)) return res.status(403).json({ error: 'Sem permissão para esta ação.' });
  next();
}

/** Limitador simples de tentativas de login (por IP+usuário). */
export class LoginLimiter {
  private hits = new Map<string, { n: number; t: number }>();
  constructor(private max = 8, private windowMs = 10 * 60 * 1000) {}
  blocked(key: string) {
    const h = this.hits.get(key);
    if (!h) return false;
    if (Date.now() - h.t > this.windowMs) { this.hits.delete(key); return false; }
    return h.n >= this.max;
  }
  fail(key: string) {
    const h = this.hits.get(key);
    if (!h || Date.now() - h.t > this.windowMs) this.hits.set(key, { n: 1, t: Date.now() });
    else h.n++;
  }
  ok(key: string) { this.hits.delete(key); }
}
