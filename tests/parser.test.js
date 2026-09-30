import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, normalize, valueOf } from '../src/parser/index.js';

const categories = [
  { slug: 'sabzi', name_en: 'Sabzi', keywords: ['sabzi', 'aloo', 'सब्ज़ी', 'सब्जी'] },
  { slug: 'doodh', name_en: 'Doodh', keywords: ['doodh', 'milk', 'दूध'] },
  { slug: 'gas', name_en: 'Gas', keywords: ['gas', 'cylinder'] },
  { slug: 'other', name_en: 'Anya', keywords: [] },
];

const amounts = (text) => parse(text, categories).items.map((i) => i.amount);

test('digits, with and without a rupee word', () => {
  assert.deepEqual(amounts('sabzi 120 rupaye'), [120]);
  assert.deepEqual(amounts('sabzi 120rs'), [120]);
  assert.deepEqual(amounts('sabzi ₹1,200'), [1200]);
});

test('Devanagari digits and number words', () => {
  assert.deepEqual(amounts('सब्ज़ी १२० रुपये'), [120]);
  assert.deepEqual(amounts('दूध साठ रुपये'), [60]);
});

test('spoken compounds', () => {
  assert.equal(valueOf(['do', 'sau', 'pachas']), 250);
  assert.equal(valueOf(['dhai', 'sau']), 250);
  assert.equal(valueOf(['dedh', 'hazaar']), 1500);
  assert.equal(valueOf(['ek', 'hazaar', 'paanch', 'sau']), 1500);
  assert.equal(valueOf(['2', 'lakh']), 200000);
  assert.equal(valueOf(['hello']), 0);
});

test('object prototype keys are not number words', () => {
  assert.deepEqual(amounts('constructor 50'), [50]);
  assert.deepEqual(amounts('toString valueOf'), [null]);
});

test('several items in one sentence', () => {
  const { items } = parse('doodh 60 aur sabzi 120', categories);
  assert.deepEqual(items.map((i) => [i.category.slug, i.amount]), [['doodh', 60], ['sabzi', 120]]);
});

test('amount that arrives in the next segment', () => {
  const { items } = parse('sabzi, 120', categories);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, 120);
  assert.equal(items[0].category.slug, 'sabzi');
});

test('missing amount is reported as null, not guessed', () => {
  const { items } = parse('sabzi', categories);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, null);
});

test('unknown words fall back to the "other" category', () => {
  assert.equal(parse('kuch bhi 40', categories).items[0].category.slug, 'other');
});

test('Latin keywords need word edges', () => {
  assert.equal(parse('gasoline 40', categories).items[0].category.slug, 'other');
  assert.equal(parse('gas 40', categories).items[0].category.slug, 'gas');
});

test('kal / parso shift the day', () => {
  assert.equal(parse('kal sabzi 50', categories).items[0].offset, -1);
  assert.equal(parse('parso sabzi 50', categories).items[0].offset, -2);
  assert.equal(parse('sabzi 50', categories).items[0].offset, 0);
});

test('note drops filler words', () => {
  assert.equal(parse('aaj sabzi pe 120 rupaye', categories).items[0].note, 'sabzi');
});

test('questions are detected, with the category when named', () => {
  const r = parse('sabzi pe kitna gaya', categories);
  assert.equal(r.question, true);
  assert.equal(r.category.slug, 'sabzi');
  assert.equal(parse('total kitna hua', categories).category, null);
});

test('empty input', () => {
  assert.deepEqual(parse('', categories).items, []);
  assert.equal(normalize(null), '');
});

test('"tel" for a scooty is transport, not kirana', () => {
  const cats = [
    { slug: 'kirana', keywords: ['tel'] },
    { slug: 'transport', keywords: ['scooty', 'petrol'] },
    { slug: 'other', keywords: [] },
  ];
  const { items } = parse('aaj harshit ne scooty me 500 ka tel dalwaya', cats);
  assert.equal(items.length, 1);
  assert.equal(items[0].amount, 500);
  assert.equal(items[0].category.slug, 'transport');
  assert.equal(items[0].note, 'harshit scooty tel');
});
