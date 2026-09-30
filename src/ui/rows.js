import { html, raw } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { categoryFor } from '../store.js';
import { dayLabel } from '../lib/format.js';
import { inr } from '../lib/format.js';
import { removeExpense } from '../actions.js';
import { openEdit } from './edit.js';
import { toast } from '../lib/toast.js';

const ARM_TIMEOUT_MS = 3000;

export function expenseRow(state, expense, { withDate = false } = {}) {
  const c = categoryFor(state, expense.category_id);
  const showNote = expense.note && expense.note.toLowerCase() !== c.name_en.toLowerCase();
  const meta = [c.name_hi, withDate && expense.spent_on ? dayLabel(expense.spent_on) : '', showNote ? expense.note : '']
    .filter(Boolean).join(' · ');
  return html`<div class="row" data-edit="${expense.id}" tabindex="0" role="button" aria-label="${c.name_en} ${inr(expense.amount)} badlo">
    <div class="chip" style="background:${c.color}">${icon(c.icon)}</div>
    <div class="row-main"><div class="row-name">${c.name_en}</div><div class="row-meta">${meta}</div></div>
    <div class="amt">${inr(expense.amount)}</div>
    <button class="del" type="button" data-del="${expense.id}" aria-label="${c.name_en} ${inr(expense.amount)} hatao">
      ${icon('trash')}<span class="del-confirm">Pakka?</span>
    </button>
  </div>`;
}

export function emptyState(iconName, message) {
  return html`<div class="empty">${icon(iconName)}<p>${message}</p></div>`;
}

export function errorState(message) {
  return html`<div class="empty empty-error">${icon('wifi')}<p>${message}</p>
    <button class="secondary-inline" type="button" data-action="retry">Dobara koshish karo</button></div>`;
}

export function skeletonRows(count = 3) {
  return raw(Array.from({ length: count }, () => '<div class="row skeleton" aria-hidden="true"></div>').join(''));
}

/** Tap a row to edit it. */
export function bindEdit(container) {
  const open = (ev) => {
    if (ev.target.closest('[data-del]')) return;
    const row = ev.target.closest('[data-edit]');
    if (row) openEdit(row.dataset.edit);
  };
  container.addEventListener('click', open);
  container.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-edit]')) { ev.preventDefault(); open(ev); }
  });
}

/** Two-tap delete (no browser popups): first tap arms the button, second tap deletes. */
export function bindDelete(container) {
  container.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-del]');
    if (!btn) return;
    if (btn.dataset.armed) {
      btn.disabled = true;
      try {
        await removeExpense(btn.dataset.del);
        toast('Hata diya');
      } catch {
        btn.disabled = false;
        toast('Nahi hata paye, internet dekho');
      }
      return;
    }
    btn.dataset.armed = '1';
    setTimeout(() => { delete btn.dataset.armed; }, ARM_TIMEOUT_MS);
  });
}
