import { $, html, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { store, sumOf, categoryFor, isCurrentMonth } from '../store.js';
import { changeMonth } from '../actions.js';
import { inr, MONTHS_HI, dayLabel, weekdayHi } from '../lib/format.js';
import { expenseRow, emptyState, errorState, skeletonRows, bindDelete, bindEdit } from './rows.js';

function categoryBars(state) {
  const totals = new Map();
  state.viewList.forEach((e) => {
    const key = e.category_id || 'none';
    totals.set(key, (totals.get(key) || 0) + Number(e.amount));
  });
  const ranked = [...totals].sort((a, b) => b[1] - a[1]);
  const max = ranked.length ? ranked[0][1] : 1;
  const grand = sumOf(state.viewList);

  return ranked.map(([id, total]) => {
    const c = categoryFor(state, id);
    return html`<div class="bar">
      <div class="bar-head">
        <span class="chip chip-sm" style="background:${c.color}">${icon(c.icon)}</span>
        <span class="bar-name">${c.name_en} · ${c.name_hi}</span>
        <span class="bar-amt">${inr(total)}<small>${Math.round((total / grand) * 100)}%</small></span>
      </div>
      <div class="track"><div class="fill" style="--scale:${Math.max(0.03, total / max)}"></div></div>
    </div>`;
  });
}

/** Expenses grouped by day (already sorted newest first), each group with its day total. */
function dayGroups(state) {
  const groups = [];
  state.viewList.forEach((e) => {
    const last = groups[groups.length - 1];
    if (last && last.day === e.spent_on) last.items.push(e);
    else groups.push({ day: e.spent_on, items: [e] });
  });
  return groups.map((g) => html`<section class="day-group">
    <h3 class="day-head"><span>${dayLabel(g.day)} · ${weekdayHi(g.day)}</span><span>${inr(sumOf(g.items))}</span></h3>
    ${g.items.map((e) => expenseRow(state, e))}
  </section>`);
}

function render(state) {
  const { view } = state;
  $('month-title').textContent = `${MONTHS_HI[view.m]} ${view.y}`;
  $('next-month').disabled = isCurrentMonth(view);
  $('screen-month').setAttribute('aria-busy', String(state.viewLoading));

  const bars = $('bars');
  const list = $('month-list');

  if (state.status === 'loading' || state.viewLoading) {
    $('month-total-2').textContent = '—';
    mount(bars, skeletonRows(2));
    return mount(list, '');
  }
  if (state.status !== 'ready') {
    $('month-total-2').textContent = '—';
    mount(bars, state.status === 'error' ? errorState('Data nahi aa paya. Internet dekho.') : '');
    return mount(list, '');
  }

  $('month-total-2').textContent = inr(sumOf(state.viewList));
  if (!state.viewList.length) {
    mount(bars, emptyState('wallet', 'Is mahine kuch nahi likha.'));
    return mount(list, '');
  }
  mount(bars, categoryBars(state));
  mount(list, dayGroups(state));
}

export function initMonth() {
  $('prev-month').addEventListener('click', () => changeMonth(-1));
  $('next-month').addEventListener('click', () => changeMonth(1));
  bindDelete($('month-list'));
  bindEdit($('month-list'));
  store.subscribe(render);
  render(store.get());
}
