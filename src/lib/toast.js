import { $ } from './dom.js';

const VISIBLE_MS = 2600;
let timer;

export function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), VISIBLE_MS);
}
