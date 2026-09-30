import { boot, start } from './actions.js';
import { initHome } from './ui/home.js';
import { initMonth } from './ui/month.js';
import { initTabs } from './ui/tabs.js';
import { initSheet } from './ui/sheet.js';
import { initEdit } from './ui/edit.js';
import { initAuth } from './ui/auth.js';
import { initProfile } from './ui/profile.js';
import { initInsights } from './ui/insights.js';

initAuth();
initProfile();
initTabs();
initHome();
initMonth();
initInsights();
initSheet();
initEdit();

// "Try again" buttons rendered inside error states
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="retry"]')) boot();
});

start();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is a bonus */ });
}
