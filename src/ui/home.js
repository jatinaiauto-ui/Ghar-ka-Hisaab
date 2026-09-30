import { $, mount } from '../lib/dom.js';
import { store, sumOf } from '../store.js';
import { inr, today, greeting } from '../lib/format.js';
import { expenseRow, emptyState, errorState, skeletonRows, bindDelete, bindEdit } from './rows.js';

function render(state) {
  const name = state.profile && state.profile.full_name;
  $('greeting').textContent = name ? `${greeting()}, ${name}` : greeting();
  const list = $('today-list');

  if (state.status === 'loading') {
    $('month-total').textContent = '—';
    $('month-budget').textContent = '';
    $('today-total').textContent = '';
    return mount(list, skeletonRows());
  }
  if (state.status === 'unconfigured') {
    $('month-total').textContent = '—';
    return mount(list, emptyState('alert', 'Setup baaki hai: src/config.js mein Supabase URL aur key daalo.'));
  }
  if (state.status === 'error') {
    $('month-total').textContent = '—';
    return mount(list, errorState('Data nahi aa paya. Internet dekho.'));
  }

  const spent = sumOf(state.currentMonth);
  $('month-total').textContent = inr(spent);
  const budget = Number(state.profile && state.profile.monthly_budget);
  $('month-budget').textContent = budget > 0
    ? (spent <= budget ? `Budget ${inr(budget)} · ${inr(budget - spent)} left` : `Budget ${inr(budget)} · ${inr(spent - budget)} over`)
    : '';
  const todays = state.currentMonth.filter((e) => e.spent_on === today());
  $('today-total').textContent = todays.length ? inr(sumOf(todays)) : '';
  mount(list, todays.length
    ? todays.map((e) => expenseRow(state, e))
    : emptyState('wallet', 'Aaj abhi kuch nahi likha. Neeche mic dabao aur bolo.'));
}

export function initHome() {
  bindDelete($('today-list'));
  bindEdit($('today-list'));
  store.subscribe(render);
  render(store.get());
}
