import { randomUUID } from 'node:crypto';

export const GATEWAY_WEB_SESSION_COOKIE = 'myconcierge_session_id';

export function normalizeGatewayWebSessionId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

export function ensureGatewayWebSessionId(value: unknown): string {
  return normalizeGatewayWebSessionId(value) ?? randomUUID().replaceAll('-', '');
}
