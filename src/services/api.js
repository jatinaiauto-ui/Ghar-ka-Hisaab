import { config } from '../config.js';
import { getAccessToken, refreshSession } from './auth.js';

const TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Minimal Supabase (PostgREST) client. Returns parsed JSON, or null for empty bodies:
 * PostgREST answers `Prefer: return=minimal` writes with 201/204 and no body.
 */
async function authHeaders() {
  const token = await getAccessToken();
  if (!token) throw new ApiError('not signed in', 401);
  return { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Fetch with the signed-in user's token. A 401 (token expired early, clock skew) gets one refresh and retry;
 * if the session is really gone, `auth` has already signed the user out.
 */
export async function authedFetch(url, init, retry = true) {
  const res = await fetch(url, { ...init, headers: { ...init.headers, ...(await authHeaders()) } });
  if (res.status === 401 && retry && (await refreshSession())) return authedFetch(url, init, false);
  return res;
}

export async function request(path, { method = 'GET', body, prefer } = {}) {
  const headers = prefer ? { Prefer: prefer } : {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await authedFetch(`${config.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(text || res.statusText, res.status);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}
