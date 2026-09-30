// Supabase Edge Function: `analyze`
//   POST { action: "parse", text }            -> structured expenses / question, read by an LLM
//   POST { action: "insights", year, month }  -> short Hinglish summary of a month (month is 0-11)
//
// Callers must be signed in: the user is read from the Authorization bearer token, and every query
// (expenses, cached insights, daily usage cap) is scoped to that user.
// The OpenRouter key lives only here (supabase secrets), never in the browser.
// Deploy:  supabase secrets set OPENROUTER_API_KEY=sk-or-...
//          supabase functions deploy analyze
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  INSIGHT_SYSTEM_PROMPT, MAX_TEXT, PARSE_SCHEMA, insightBasis, parseSystemPrompt, sanitizeParse, summarizeMonth,
  type Category, type ExpenseRow,
} from './logic.ts';

const MODEL = Deno.env.get('AI_MODEL') ?? 'openai/gpt-4.1-mini';
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 60);                 // per person
const GLOBAL_DAILY_LIMIT = Number(Deno.env.get('AI_GLOBAL_DAILY_LIMIT') ?? 3000);   // everyone together
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Message = { role: 'system' | 'user'; content: string };

async function chat(messages: Message[], opts: { schema?: object; temperature: number; maxTokens: number }): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'X-Title': 'Ghar ka Hisaab',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.schema
        ? { response_format: { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: opts.schema } } }
        : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function loadCategories(): Promise<(Category & { id: string })[]> {
  const { data, error } = await db.from('categories').select('id,slug,name_en,name_hi,description').order('sort');
  if (error) throw error;
  return data ?? [];
}

// ---------- parse ----------

async function parse(text: string) {
  const categories = await loadCategories();
  const content = await chat(
    [{ role: 'system', content: parseSystemPrompt(categories) }, { role: 'user', content: text }],
    { schema: PARSE_SCHEMA, temperature: 0, maxTokens: 600 },
  );
  return sanitizeParse(JSON.parse(content), categories);
}

// ---------- insights ----------

const pad = (n: number) => String(n).padStart(2, '0');
const monthStart = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
};

async function expensesBetween(userId: string, start: string, end: string): Promise<ExpenseRow[]> {
  const { data, error } = await db.from('expenses').select('amount,spent_on,category_id')
    .eq('user_id', userId).gte('spent_on', start).lt('spent_on', end);
  if (error) throw error;
  return data ?? [];
}

async function insights(userId: string, year: number, month: number) {
  const start = monthStart(year, month);
  const [rows, previous, categories] = await Promise.all([
    expensesBetween(userId, start, monthStart(year, month + 1)),
    expensesBetween(userId, monthStart(year, month - 1), start),
    loadCategories(),
  ]);
  const names = new Map(categories.map((c) => [c.id, c.name_en]));
  const summary = summarizeMonth(rows, previous, (id) => (id && names.get(id)) || 'Anya');
  const basis = insightBasis(summary);

  const { data: cached } = await db.from('month_insights').select('basis,summary').eq('user_id', userId).eq('month', start).maybeSingle();
  if (cached && cached.basis === basis) return { summary: cached.summary as string, cached: true };

  const text = (await chat(
    [{ role: 'system', content: INSIGHT_SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(summary) }],
    { temperature: 0.4, maxTokens: 300 },
  )).trim();
  if (!text) throw new Error('empty insight');
  await db.from('month_insights').upsert({ user_id: userId, month: start, basis, summary: text });
  return { summary: text, cached: false };
}

// ---------- http ----------

/** The signed-in user's id from the bearer token, or null (missing, expired, or just the anon key). */
async function userIdOf(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

const withinLimit = async (userId: string) =>
  Boolean((await db.rpc('bump_ai_usage', { uid: userId, max_user: DAILY_LIMIT, max_global: GLOBAL_DAILY_LIMIT })).data);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const userId = await userIdOf(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400);

  try {
    if (body.action === 'parse') {
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
      if (!text) return json({ error: 'bad_request' }, 400);
      if (!(await withinLimit(userId))) return json({ error: 'limit' }, 429);
      return json(await parse(text));
    }
    if (body.action === 'insights') {
      const { year, month } = body;
      if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2000 || year > 2100 || month < 0 || month > 11) {
        return json({ error: 'bad_request' }, 400);
      }
      if (!(await withinLimit(userId))) return json({ error: 'limit' }, 429);
      return json(await insights(userId, year, month));
    }
    return json({ error: 'bad_request' }, 400);
  } catch (err) {
    console.error('analyze failed:', err);          // details stay in the function logs
    return json({ error: 'ai_failed' }, 502);
  }
});
