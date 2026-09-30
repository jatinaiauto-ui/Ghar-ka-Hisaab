import { $, qsa } from '../lib/dom.js';

const TABS = ['home', 'month', 'profile'];   // profile has no dock tab: opened from the Home header

function select(name) {
  qsa('.tab[data-tab]').forEach((tab) => {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  TABS.forEach((t) => $(`screen-${t}`).classList.toggle('active', t === name));
}

/** Bottom tabs. The active tab lives in the URL hash so a reload keeps the place, without piling up history. */
export function initTabs() {
  const fromHash = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home');
  select(fromHash());
  qsa('[data-tab], [data-goto]').forEach((el) => {
    el.addEventListener('click', () => {
      const name = el.dataset.tab || el.dataset.goto;
      select(name);
      history.replaceState(null, '', `#${name}`);
      window.scrollTo(0, 0);
    });
  });
}
