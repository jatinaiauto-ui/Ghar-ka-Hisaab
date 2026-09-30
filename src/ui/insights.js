import { $, html, mount } from '../lib/dom.js';
import { aiEnabled } from '../config.js';
import { store } from '../store.js';
import { fetchInsight } from '../services/ai.js';

/** "Hisaab ki baat": an AI-written summary of the month on the Mahina tab. Only fetched when she taps the button. */

let current = { key: '', status: 'idle', text: '' };   // status: idle | loading | done | error

const keyOf = ({ y, m }) => `${y}-${m}`;

function render(state) {
  const box = $('insight');
  const visible = aiEnabled && state.status === 'ready' && !state.viewLoading && state.viewList.length > 0;
  box.hidden = !visible;
  if (!visible) return;

  const key = keyOf(state.view);
  if (current.key !== key) current = { key, status: 'idle', text: '' };

  const body = $('insight-body');
  if (current.status === 'done') {
    mount(body, html`<p class="insight-text">${current.text}</p>
      <button class="secondary-inline" type="button" data-insight>Dobara batao</button>`);
  } else if (current.status === 'loading') {
    mount(body, html`<p class="insight-text insight-wait">Soch rahi hoon…</p>`);
  } else {
    const note = current.status === 'error' ? html`<p class="insight-text">Abhi nahi ho paya. Thodi der baad koshish karo.</p>` : '';
    mount(body, html`${note}<button class="secondary-inline" type="button" data-insight>Is mahine ki baat batao</button>`);
  }
}

async function load() {
  const { view } = store.get();
  const key = keyOf(view);
  current = { key, status: 'loading', text: '' };
  render(store.get());
  try {
    const text = await fetchInsight(view.y, view.m);
    if (current.key === key) current = { key, status: 'done', text };
  } catch {
    if (current.key === key) current = { key, status: 'error', text: '' };
  }
  render(store.get());
}

export function initInsights() {
  $('insight').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-insight]')) load();
  });
  store.subscribe(render);
  render(store.get());
}
