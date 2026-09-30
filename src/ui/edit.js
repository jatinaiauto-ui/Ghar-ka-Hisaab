import { $, html, mount } from '../lib/dom.js';
import { store } from '../store.js';
import { editExpense } from '../actions.js';
import { today } from '../lib/format.js';
import { toast } from '../lib/toast.js';

/** Edit dialog for an already-saved entry: category, amount, note, date. */
let current = null;
let opener = null;
let saving = false;

export function openEdit(id) {
  const { currentMonth, viewList, categories, otherCategory } = store.get();
  const expense = [...currentMonth, ...viewList].find((e) => e.id === id);
  if (!expense) return;
  current = expense;
  opener = document.activeElement;
  const selected = expense.category_id || (otherCategory || {}).id;
  mount($('edit-cat'), categories.map((c) =>
    html`<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.name_hi} · ${c.name_en}</option>`));
  $('edit-amount').value = expense.amount;
  $('edit-amount').classList.remove('bad');
  $('edit-note').value = expense.note || '';
  $('edit-date').value = expense.spent_on;
  $('edit-date').max = today();
  $('edit').hidden = false;
  $('shell').inert = true;
  $('edit-amount').focus();
}

function close() {
  $('edit').hidden = true;
  $('shell').inert = false;
  current = null;
  if (opener && opener.focus) opener.focus();
}

async function save(ev) {
  ev.preventDefault();
  if (!current || saving) return;
  const amount = parseFloat($('edit-amount').value);
  if (!(amount > 0)) {
    $('edit-amount').classList.add('bad');
    toast('Rupaye bharo');
    return $('edit-amount').focus();
  }
  saving = true;
  const btn = $('edit-save');
  btn.disabled = true;
  try {
    await editExpense(current.id, {
      amount,
      category_id: $('edit-cat').value,
      note: $('edit-note').value.trim(),
      spent_on: $('edit-date').value || current.spent_on,
    });
    toast('Badal diya ✓');
    close();
  } catch {
    toast('Nahi badal paye. Internet dekho.');
  } finally {
    saving = false;
    btn.disabled = false;
  }
}

export function initEdit() {
  $('edit-form').addEventListener('submit', save);
  $('edit-cancel').addEventListener('click', close);
  $('edit').addEventListener('click', (ev) => { if (ev.target === $('edit')) close(); });
  $('edit').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
}
