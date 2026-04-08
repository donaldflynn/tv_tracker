import { sign, verify } from 'hono/jwt';
import type { PendingAuth } from '@showtracker/types';

const SESSION_TTL = 30 * 24 * 60 * 60; // 30 days
const PENDING_AUTH_TTL = 15 * 60; // 15 minutes

export async function createSessionToken(userId: number, secret: string): Promise<string> {
  return sign(
    {
      sub: String(userId),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
    },
    secret,
  );
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ sub: string } | null> {
  try {
    const payload = await verify(token, secret);
    return payload as { sub: string };
  } catch {
    return null;
  }
}

export async function createPendingAuthToken(
  data: PendingAuth,
  secret: string,
): Promise<string> {
  return sign(
    {
      ...data,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + PENDING_AUTH_TTL,
    },
    secret,
  );
}

export async function verifyPendingAuthToken(
  token: string,
  secret: string,
): Promise<PendingAuth | null> {
  try {
    const payload = await verify(token, secret);
    return payload as unknown as PendingAuth;
  } catch {
    return null;
  }
}

// ── Signed OAuth state (no cookie required) ───────────────────────────────────
// State = "<uuid>.<hmac-sha256-hex>". The HMAC proves the nonce was issued by
// this server, replacing the need for a state cookie across the OAuth redirect.

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createSignedState(secret: string): Promise<string> {
  const nonce = crypto.randomUUID();
  const sig = await hmacHex(nonce, secret);
  return `${nonce}.${sig}`;
}

export async function verifySignedState(
  signedState: string,
  secret: string,
): Promise<boolean> {
  try {
    const dot = signedState.lastIndexOf('.');
    if (dot === -1) return false;
    const nonce = signedState.substring(0, dot);
    const sig = signedState.substring(dot + 1);
    const expected = await hmacHex(nonce, secret);
    return expected === sig;
  } catch {
    return false;
  }
}
