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
