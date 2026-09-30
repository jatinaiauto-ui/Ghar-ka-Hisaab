import { $ } from '../lib/dom.js';
import { store } from '../store.js';
import { saveProfile } from '../actions.js';
import { toast } from '../lib/toast.js';

/** Profile form: optional personal details, saved to the `profiles` table. */

const FIELDS = { full_name: 'pf-name', phone: 'pf-phone', city: 'pf-city', household_size: 'pf-size', monthly_budget: 'pf-budget' };

let filledFor = null;      // the profile object last copied into the inputs, so typing is never overwritten

function render({ profile }) {
  if (profile === filledFor) return;
  filledFor = profile;
  for (const [field, id] of Object.entries(FIELDS)) $(id).value = profile?.[field] ?? '';
}

const numberOrNull = (value) => (value === '' ? null : Number(value));

async function submit(ev) {
  ev.preventDefault();
  const fields = {
    full_name: $('pf-name').value.trim(),
    phone: $('pf-phone').value.trim(),
    city: $('pf-city').value.trim(),
    household_size: numberOrNull($('pf-size').value),
    monthly_budget: numberOrNull($('pf-budget').value),
  };
  if (fields.household_size !== null && !(Number.isInteger(fields.household_size) && fields.household_size >= 1 && fields.household_size <= 30)) {
    return toast('Household size must be between 1 and 30.');
  }
  if (fields.monthly_budget !== null && !(fields.monthly_budget >= 0)) return toast('Please enter a valid budget.');

  const button = $('pf-save');
  button.disabled = true;
  try {
    await saveProfile(fields);
    toast('Saved.');
  } catch {
    toast('Could not save. Please check your internet connection.');
  } finally {
    button.disabled = false;
  }
}

export function initProfile() {
  $('profile-form').addEventListener('submit', submit);
  store.subscribe(render);
  render(store.get());
}
