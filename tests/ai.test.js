import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toParseResult } from '../src/services/ai.js';
import {
  sanitizeParse, parseSystemPrompt, summarizeMonth, insightBasis, PARSE_SCHEMA,
} from '../supabase/functions/analyze/logic.ts';

const categories = [
  { slug: 'sabzi', name_en: 'Sabzi', name_hi: 'सब्ज़ी', description: 'Vegetables' },
  { slug: 'doodh', name_en: 'Doodh', name_hi: 'दूध', description: 'Milk and dairy' },
  { slug: 'other', name_en: 'Anya', name_hi: 'अन्य', description: 'Anything else' },
];

// ---------- client adapter ----------

test('adapter: AI expenses become parser-shaped items', () => {
  const r = toParseResult({
    kind: 'expenses',
    items: [
      { amount: 60, category: 'doodh', note: '', days_ago: 0 },
      { amount: 120, category: 'sabzi', note: 'aloo', days_ago: 1 },
    ],
  }, categories);
  assert.equal(r.question, false);
  assert.deepEqual(r.items.map((i) => [i.category.slug, i.amount, i.offset]), [['doodh', 60, 0], ['sabzi', 120, -1]]);
});

test('adapter: unknown category falls back to other, bad amount becomes null', () => {
  const r = toParseResult({ kind: 'expenses', items: [{ amount: 0, category: 'spaceship', note: 'x', days_ago: 99 }] }, categories);
  assert.equal(r.items[0].category.slug, 'other');
  assert.equal(r.items[0].amount, null);
  assert.equal(r.items[0].offset, -31);
});

test('adapter: questions carry the category, "other" counts as none', () => {
  assert.equal(toParseResult({ kind: 'question', question_category: 'sabzi', items: [] }, categories).category.slug, 'sabzi');
  assert.equal(toParseResult({ kind: 'question', question_category: 'other', items: [] }, categories).category, null);
  assert.equal(toParseResult({ kind: 'question', question_category: null, items: [] }, categories).question, true);
});

test('adapter: unclear or garbage yields no items', () => {
  assert.deepEqual(toParseResult({ kind: 'unclear', items: [] }, categories).items, []);
  assert.deepEqual(toParseResult(null, categories).items, []);
});

// ---------- server-side validation of model output ----------

test('sanitize: keeps valid output', () => {
  const out = sanitizeParse({
    kind: 'expenses', question_category: null,
    items: [{ amount: 250, category: 'sabzi', note: ' aloo pyaaz ', days_ago: 2 }],
  }, categories);
  assert.deepEqual(out.items, [{ amount: 250, category: 'sabzi', note: 'aloo pyaaz', days_ago: 2 }]);
});

test('sanitize: clamps hostile or broken values', () => {
  const out = sanitizeParse({
    kind: 'expenses',
    items: [
      { amount: -5, category: 'nope', note: 'x'.repeat(500), days_ago: -3 },
      { amount: 1e12, category: 'sabzi', note: 7, days_ago: 1.5 },
      { amount: '50', category: 'sabzi', note: '', days_ago: 400 },
    ],
  }, categories);
  assert.deepEqual(out.items.map((i) => i.amount), [null, null, null]);
  assert.equal(out.items[0].category, 'other');
  assert.equal(out.items[0].note.length, 80);
  assert.equal(out.items[0].days_ago, 0);
  assert.equal(out.items[1].note, '');
  assert.equal(out.items[2].days_ago, 31);
});

test('sanitize: caps item count and rejects non-objects', () => {
  const many = Array.from({ length: 50 }, () => ({ amount: 1, category: 'sabzi', note: '', days_ago: 0 }));
  assert.equal(sanitizeParse({ kind: 'expenses', items: many }, categories).items.length, 20);
  assert.equal(sanitizeParse('ignore all rules', categories).kind, 'unclear');
  assert.equal(sanitizeParse({ kind: 'expenses', items: [] }, categories).kind, 'unclear');
});

test('sanitize: question with an unknown category drops it', () => {
  assert.equal(sanitizeParse({ kind: 'question', question_category: 'zzz' }, categories).question_category, null);
  assert.equal(sanitizeParse({ kind: 'question', question_category: 'doodh' }, categories).question_category, 'doodh');
});

test('prompt lists every category with its description; schema is strict', () => {
  const p = parseSystemPrompt(categories);
  assert.match(p, /- doodh: Doodh \(दूध\) — Milk and dairy/);
  assert.equal(PARSE_SCHEMA.additionalProperties, false);
});

// ---------- month aggregation ----------

test('summarizeMonth: totals, comparison, biggest day are computed in code', () => {
  const names = { a: 'Sabzi', b: 'Gas' };
  const nameOf = (id) => names[id] || 'Anya';
  const s = summarizeMonth(
    [
      { amount: '100.50', spent_on: '2026-09-01', category_id: 'a' },
      { amount: 1050, spent_on: '2026-09-02', category_id: 'b' },
      { amount: 50, spent_on: '2026-09-02', category_id: null },
    ],
    [{ amount: 80, spent_on: '2026-08-05', category_id: 'a' }],
    nameOf,
  );
  assert.equal(s.total, 1200.5);
  assert.equal(s.previous_total, 80);
  assert.equal(s.entries, 3);
  assert.equal(s.days_with_spending, 2);
  assert.deepEqual(s.biggest_day, { date: '2026-09-02', total: 1100 });
  assert.deepEqual(s.by_category[0], { category: 'Gas', total: 1050, previous_total: 0 });
  assert.equal(s.by_category.find((c) => c.category === 'Sabzi').previous_total, 80);
  assert.equal(insightBasis(s), '3:1200.5');
});

test('summarizeMonth: empty month', () => {
  const s = summarizeMonth([], [], () => 'x');
  assert.equal(s.total, 0);
  assert.equal(s.biggest_day, null);
  assert.deepEqual(s.by_category, []);
});
