import { store, emptyData, isCurrentMonth } from './store.js';
import { isConfigured } from './config.js';
import * as expenses from './services/expenses.js';
import * as auth from './services/auth.js';
import * as profiles from './services/profile.js';
import { request } from './services/api.js';
import { toast } from './lib/toast.js';

/** Load categories + this month + the month on the Mahina tab. Throws on network failure. */
export async function refresh() {
  const { view } = store.get();
  const now = new Date();
  const current = expenses.fetchMonth(now.getFullYear(), now.getMonth());
  const viewed = isCurrentMonth(view) ? current : expenses.fetchMonth(view.y, view.m);
  const [currentMonth, viewList] = await Promise.all([current, viewed]);
  store.set({ currentMonth, viewList });
}

function showSignedOut() {
  store.set({ ...emptyData(), status: 'signedout', user: null, profile: null, recovering: false });
}

// A refresh token that stops working (or a sign-out from the menu) drops back to the sign-in screen.
auth.onSignedOut(showSignedOut);

export async function signIn(email, password) {
  await auth.signIn(email, password);
  return boot();
}

/** Resolves `{ needsConfirm }` when the project wants the email confirmed before the first sign-in. */
export async function signUp(email, password) {
  const result = await auth.signUp(email, password);
  if (result.user) await boot();
  return result;
}

export const signOut = () => auth.signOut();
export const requestPasswordReset = auth.requestPasswordReset;

export async function setNewPassword(password) {
  await auth.changePassword(password);
  return boot();
}

export async function saveProfile(fields) {
  const { user } = store.get();
  await profiles.saveProfile(user.id, fields);
  store.set({ profile: { ...store.get().profile, ...fields } });
}

/** Permanently delete this account and all its expenses, then sign out. */
export async function deleteAccount() {
  await request('rpc/delete_my_account', { method: 'POST', body: {} });
  await auth.signOut();
}

/** First load: if the person arrived through an email link, sign them in with it first. */
export async function start() {
  const link = isConfigured ? await auth.consumeEmailLink() : null;
  if (link === 'recovery') return store.set({ status: 'signedout', user: auth.currentUser(), recovering: true });
  if (link) toast('Email confirmed. Welcome!');
  return boot();
}

export async function boot() {
  if (!isConfigured) return store.set({ status: 'unconfigured' });
  const user = auth.currentUser();
  if (!user) return showSignedOut();
  store.set({ status: 'loading', user, recovering: false });
  try {
    const categories = await expenses.fetchCategories();
    const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
    const otherCategory = categories.find((c) => c.slug === 'other') || null;
    store.set({ categories, categoryById, otherCategory });
    await refresh();
    store.set({ status: 'ready' });
    profiles.fetchProfile().then((profile) => store.set({ profile })).catch(() => { /* the app works without it */ });
  } catch {
    store.set({ status: 'error' });
  }
}

let monthRequest = 0;

/** Move the Mahina tab by `delta` months. Never goes past the current month. */
export async function changeMonth(delta) {
  const { view: previous } = store.get();
  const date = new Date(previous.y, previous.m + delta, 1);
  const view = { y: date.getFullYear(), m: date.getMonth() };
  const now = new Date();
  if (view.y * 12 + view.m > now.getFullYear() * 12 + now.getMonth()) return;

  const request = ++monthRequest;             // ignore stale responses when tapping quickly
  store.set({ view, viewLoading: true });
  try {
    const viewList = await expenses.fetchMonth(view.y, view.m);
    if (request === monthRequest) store.set({ viewList, viewLoading: false });
  } catch {
    if (request !== monthRequest) return;
    store.set({ view: previous, viewLoading: false });
    toast('Mahina nahi khul paya. Internet dekho.');
  }
}

export async function saveExpenses(rows) {
  await expenses.addExpenses(rows);
  refresh().catch(() => toast('Likh liya, par list abhi nahi badli. Dobara kholo.'));
}

export async function removeExpense(id) {
  await expenses.deleteExpense(id);
  await refresh();
}

export async function editExpense(id, fields) {
  await expenses.updateExpense(id, fields);
  await refresh();
}
