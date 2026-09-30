import { config } from '../config.js';
import { ApiError, authedFetch } from './api.js';

const TIMEOUT_MS = { parse: 8000, insights: 25000 };

async function call(payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await authedFetch(`${config.SUPABASE_URL}/functions/v1/analyze`, {
      method: 'POST',
      headers: {},
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError((await res.text()) || res.statusText, res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Raw AI reading of a sentence: { kind, items, question_category }. Throws on any failure. */
export const analyzeText = (text) => call({ action: 'parse', text }, TIMEOUT_MS.parse);

/** Short Hinglish summary of a month (month is 0-11). */
export const fetchInsight = (year, month) => call({ action: 'insights', year, month }, TIMEOUT_MS.insights).then((r) => r.summary);

/**
 * Convert the AI reading into the same shape `parser.parse` returns, so the rest of the app
 * does not care which one produced it. Unknown categories fall back to "other".
 */
export function toParseResult(ai, categories) {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const other = bySlug.get('other') || null;

  if (ai && ai.kind === 'question') {
    const c = bySlug.get(ai.question_category);
    return { question: true, category: c && c.slug !== 'other' ? c : null, items: [] };
  }
  const list = ai && ai.kind === 'expenses' && Array.isArray(ai.items) ? ai.items : [];
  const items = list.map((it) => {
    const amount = Number(it.amount);
    const daysAgo = Math.min(Math.max(parseInt(it.days_ago, 10) || 0, 0), 31);
    return {
      amount: amount > 0 ? amount : null,
      category: bySlug.get(it.category) || other,
      note: String(it.note || '').slice(0, 80),
      offset: 0 - daysAgo,
    };
  });
  return { question: false, category: null, items };
}
