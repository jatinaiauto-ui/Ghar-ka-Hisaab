import { config } from '../config.js';

/**
 * Supabase Auth (GoTrue) over plain fetch, email + password. The session lives in localStorage
 * and is refreshed shortly before it expires. `onSignedOut` fires when the session is lost for good.
 */

const STORAGE_KEY = 'hisaab.session';
const TIMEOUT_MS = 15000;
const REFRESH_MARGIN_S = 60;

export class AuthError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

let session = readStored();
let refreshing = null;
const signedOutListeners = new Set();

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function setSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: the session just lasts until the tab closes */ }
}

function toSession(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + data.expires_in,
    user: { id: data.user.id, email: data.user.email },
  };
}

async function gotrue(path, { method = 'POST', body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: config.SUPABASE_KEY,
        Authorization: `Bearer ${token || config.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new AuthError(data?.msg || data?.error_description || data?.message || res.statusText, data?.error_code || data?.error, res.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const currentUser = () => (session ? session.user : null);
export const onSignedOut = (fn) => { signedOutListeners.add(fn); };

export async function signIn(email, password) {
  const data = await gotrue('token?grant_type=password', { body: { email, password } });
  setSession(toSession(data));
  return session.user;
}

/** Resolves `{ user }` when signed in straight away, or `{ needsConfirm: true }` when the project requires email confirmation. */
export async function signUp(email, password) {
  const data = await gotrue('signup', { body: { email, password } });
  if (!data.access_token) return { needsConfirm: true };
  setSession(toSession(data));
  return { user: session.user };
}

/** Email a password-reset link. Always resolves the same way, so it never reveals whether an account exists. */
export async function requestPasswordReset(email) {
  await gotrue('recover', { body: { email } });
}

export async function changePassword(password) {
  await gotrue('user', { method: 'PUT', body: { password }, token: await getAccessToken() });
}

/**
 * Email links (confirm signup, reset password) land on the site with the session in the URL hash.
 * Take it, sign in with it, clean the URL. Returns the link type ('signup', 'recovery', ...) or null.
 */
export async function consumeEmailLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('access_token');
  if (!token) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const user = await gotrue('user', { method: 'GET', token });
    setSession(toSession({
      access_token: token,
      refresh_token: params.get('refresh_token'),
      expires_in: Number(params.get('expires_in')) || 3600,
      user,
    }));
    return params.get('type') || 'signup';
  } catch {
    return null;       // expired or already-used link: the normal sign-in screen takes over
  }
}

export async function signOut() {
  const token = session?.access_token;
  setSession(null);
  if (token) gotrue('logout', { token }).catch(() => { /* already signed out locally */ });
  signedOutListeners.forEach((fn) => fn());
}

/** Swap the refresh token for a new session. A rejected token ends the session; a network failure keeps it. */
export function refreshSession() {
  if (!session) return Promise.resolve(null);
  refreshing ||= gotrue('token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
    .then((data) => { setSession(toSession(data)); return session; })
    .catch((err) => {
      if (err instanceof AuthError && err.status >= 400 && err.status < 500) {
        setSession(null);
        signedOutListeners.forEach((fn) => fn());
        return null;
      }
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** A valid access token, refreshing first if it is about to expire. Null when signed out. */
export async function getAccessToken() {
  if (!session) return null;
  if (session.expires_at - REFRESH_MARGIN_S <= Date.now() / 1000) await refreshSession();
  return session ? session.access_token : null;
}
