import { $, html, raw, mount } from '../lib/dom.js';
import { store, sumOf } from '../store.js';
import { parse } from '../parser/index.js';
import { aiEnabled } from '../config.js';
import { analyzeText, toParseResult } from '../services/ai.js';
import { saveExpenses } from '../actions.js';
import { createRecognizer, speechSupported, speak, stopSpeaking } from '../services/speech.js';
import { dateFromOffset, dayLabel, inr } from '../lib/format.js';
import { toast } from '../lib/toast.js';

/**
 * The voice sheet: listen -> confirm (editable cards) -> save, or answer a spoken question.
 * Phases: listening | idle (nothing usable yet) | confirm | answer | typing (no speech support).
 */

const LANG_KEY = 'hisaab_lang';
const SAVE_LABEL = 'Sahi hai · सही है';

let lang = readLang();
let recognizer = null;
let phase = 'idle';
let pending = [];
let saving = false;
let opener = null;
let analysis = 0;                   // id of the latest text being analyzed; stale results are ignored

function readLang() {
  try { return localStorage.getItem(LANG_KEY) || 'hi-IN'; } catch { return 'hi-IN'; }
}

function setPhase(next, title, sub) {
  phase = next;
  $('sheet-title').textContent = title;
  $('sheet-sub').textContent = sub;
  $('rings').hidden = next !== 'listening';
  $('rings').classList.toggle('live', next === 'listening');
  $('thinking').hidden = next !== 'thinking';
  $('cards').hidden = next !== 'confirm';
  $('answer').hidden = next !== 'answer';
  $('save-btn').hidden = next !== 'confirm';
  $('retry-btn').hidden = !['idle', 'confirm', 'answer'].includes(next);
}

function setHeard(text) {
  $('heard').textContent = text ? `"${text}"` : '';
}

function renderLangButton() {
  const btn = $('lang-btn');
  btn.textContent = lang === 'hi-IN' ? 'हिं' : 'EN';
  btn.setAttribute('aria-label', lang === 'hi-IN' ? 'Bhasha: Hindi. Badalne ke liye dabao' : 'Language: English. Tap to change');
}

// ---------- listening ----------

function stopListening() {
  analysis++;                       // drop any AI answer still on its way
  if (recognizer) recognizer.abort();
  recognizer = null;
}

function startListening() {
  stopListening();
  pending = [];
  setHeard('');
  if (!speechSupported) {
    return setPhase('typing', 'लिखकर बताइए', 'Is browser mein awaaz nahi chalti. Neeche likho.');
  }
  setPhase('listening', 'सुन रही हूँ…', 'Listening. Speak in Hindi or English.');

  recognizer = createRecognizer(lang, {
    onStart: () => {},
    onText: setHeard,
    onFinal: handleText,
    onError(code) {
      if (code === 'aborted') return;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setPhase('idle', 'माइक बंद है', 'Phone ki settings mein mic ki ijaazat do, ya neeche likho.');
      } else if (code === 'network') {
        setPhase('idle', 'इंटरनेट नहीं है', 'Awaaz ke liye internet chahiye. Neeche likh sakti ho.');
      } else {
        setPhase('idle', 'कुछ सुनाई नहीं दिया', 'Kuch suna nahi. Dobara bolo.');
      }
    },
    onEnd({ gotFinal }) {
      if (phase === 'listening' && !gotFinal) setPhase('idle', 'कुछ सुनाई नहीं दिया', 'Kuch suna nahi. Dobara bolo.');
    },
  });
  try {
    recognizer.start();
  } catch {
    setPhase('idle', 'माइक शुरू नहीं हुआ', 'Dobara dabao, ya neeche likho.');
  }
}

// ---------- understanding what was said ----------

/** The AI reads the sentence; the local rules take over if it is offline, slow, or finds nothing. */
async function understand(text, id) {
  const { categories } = store.get();
  if (aiEnabled) {
    try {
      const result = toParseResult(await analyzeText(text), categories);
      if (id !== analysis) return null;
      if (result.question || result.items.length) return { result, by: 'ai' };
    } catch {
      if (id !== analysis) return null;
    }
  }
  return { result: parse(text, categories), by: 'parser' };
}

async function handleText(text) {
  const id = ++analysis;
  if (aiEnabled) setPhase('thinking', 'समझ रही हूँ…', 'Ek second.');
  const understood = await understand(text, id);
  if (!understood) return;                       // closed or retried while waiting

  const { result, by } = understood;
  const { otherCategory } = store.get();
  if (result.question) return showAnswer(result);
  if (!result.items.length) {
    return setPhase('idle', 'समझ नहीं आया', 'Samajh nahi aaya. Jaise bolo: "sabzi 120 rupaye".');
  }
  pending = result.items.map((item) => ({
    amount: item.amount,
    category_id: (item.category || otherCategory || {}).id || null,
    note: item.note,
    spent_on: dateFromOffset(item.offset || 0),
    spoken: text,
    parsed_by: by,
  }));
  renderCards();
  setPhase('confirm', 'ठीक है?', 'Ye likhun? Galat ho to badal do.');
}

function renderCards() {
  const { categories } = store.get();
  mount($('cards'), pending.map((p, i) => html`<div class="card" data-i="${i}">
    <div class="card-main">
      <select aria-label="Category">${categories.map((c) =>
        html`<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${c.name_hi} · ${c.name_en}</option>`)}</select>
      <div class="card-meta">${dayLabel(p.spent_on)}${p.note ? ` · ${p.note}` : ''}</div>
    </div>
    <label class="amt-in"><span aria-hidden="true">₹</span>
      <input type="number" inputmode="decimal" min="0.01" step="any" aria-label="Rupaye" value="${p.amount ?? ''}"
        ${p.amount == null ? raw('class="bad" placeholder="?"') : ''}>
    </label>
    <button class="card-x" type="button" aria-label="Ye entry hatao">×</button>
  </div>`));
}

function showAnswer(result) {
  const { currentMonth, categories } = store.get();
  let list = currentMonth;
  let name = '';
  if (result.category) {
    const ids = categories.filter((c) => c.slug === result.category.slug).map((c) => c.id);
    list = list.filter((e) => ids.includes(e.category_id));
    name = result.category.name_en;
  }
  const total = sumOf(list);
  mount($('answer'), html`${name ? `${name} par is mahine` : 'Is mahine kul'}<b>${inr(total)}</b>`);
  setPhase('answer', 'हिसाब', 'Is mahine ka.');
  speak(`${name ? `${name} par ` : 'kul '}is mahine ${Math.round(total)} rupaye gaye`);
}

// ---------- saving ----------

async function save() {
  if (saving) return;
  const firstBad = pending.findIndex((p) => !(p.amount > 0));
  if (firstBad !== -1) {
    toast('Rupaye bharo');
    return $('cards').querySelectorAll('input')[firstBad]?.focus();
  }
  saving = true;
  const btn = $('save-btn');
  btn.disabled = true;
  btn.textContent = 'Likh rahi hoon…';
  try {
    await saveExpenses(pending.map((p) => ({
      amount: p.amount, category_id: p.category_id, note: p.note || '', spoken_text: p.spoken || null, parsed_by: p.parsed_by, spent_on: p.spent_on,
    })));
    toast('Likh liya ✓');
    close();
  } catch {
    toast('Nahi likh paye. Internet dekho.');
  } finally {
    saving = false;
    btn.disabled = false;
    btn.textContent = SAVE_LABEL;
  }
}

// ---------- open / close ----------

function open() {
  opener = document.activeElement;
  $('type-input').value = '';
  $('sheet').hidden = false;
  $('shell').inert = true;
  document.body.classList.add('scroll-locked');
  renderLangButton();
  $('sheet').focus();
  startListening();
}

function close() {
  stopListening();
  stopSpeaking();
  $('sheet').hidden = true;
  $('shell').inert = false;
  document.body.classList.remove('scroll-locked');
  if (opener && opener.focus) opener.focus();
}

export function initSheet() {
  $('mic-btn').addEventListener('click', open);
  $('close-btn').addEventListener('click', close);
  $('retry-btn').addEventListener('click', startListening);
  $('save-btn').addEventListener('click', save);
  $('sheet').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });

  $('lang-btn').addEventListener('click', () => {
    lang = lang === 'hi-IN' ? 'en-IN' : 'hi-IN';
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* private mode: keep it for this session only */ }
    renderLangButton();
    startListening();
  });

  $('type-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = $('type-input').value.trim();
    if (!text) return;
    stopListening();
    setHeard(text);
    handleText(text);
  });

  const cards = $('cards');
  cards.addEventListener('input', (ev) => {
    const card = ev.target.closest('.card');
    if (!card || ev.target.tagName !== 'INPUT') return;
    const p = pending[card.dataset.i];
    p.amount = ev.target.value === '' ? null : parseFloat(ev.target.value);
    ev.target.classList.toggle('bad', !(p.amount > 0));
  });
  cards.addEventListener('change', (ev) => {
    const card = ev.target.closest('.card');
    if (card && ev.target.tagName === 'SELECT') pending[card.dataset.i].category_id = ev.target.value;
  });
  cards.addEventListener('click', (ev) => {
    const remove = ev.target.closest('.card-x');
    if (!remove) return;
    pending.splice(Number(remove.closest('.card').dataset.i), 1);
    if (pending.length) renderCards();
    else setPhase('idle', 'हटा दिया', 'Dobara bolo ya likho.');
  });
}
