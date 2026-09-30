import { raw } from './dom.js';

// Stroke-based 24x24 paths, one visual language (see .icon in base.css).
const PATHS = {
  // categories (keys match the `icon` column in Supabase)
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14zM5 19l8-8"/>',
  fruit: '<path d="M12 8c-4-2-8 1-7 6 1 4 4 6 7 5 3 1 6-1 7-5 1-5-3-8-7-6zM12 8c0-2 1-4 3-5"/>',
  milk: '<path d="M7 4h10l-1.5 16h-7L7 4zM7.5 9h9"/>',
  bag: '<path d="M6 8h12l-1 12H7L6 8zM9 8a3 3 0 016 0"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  house: '<path d="M4 11l8-7 8 7v9H4v-9zM10 20v-6h4v6"/>',
  pill: '<path d="M8 3.5l12.5 12.5a3.5 3.5 0 01-5 5L3 8.5a3.5 3.5 0 015-5zM8 8l5 5"/>',
  bus: '<path d="M5 16V7a2 2 0 012-2h10a2 2 0 012 2v9M5 12h14M7 16v3M17 16v3M8 15h.01M16 15h.01"/>',
  shirt: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 01-8 0z"/>',
  plate: '<path d="M3 13h18M5 13a7 7 0 0014 0M12 6v2"/>',
  phone: '<path d="M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2"/>',
  dots: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
  // interface
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  wallet: '<path d="M3 7h15a3 3 0 013 3v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l11-3v3M17 14h.01"/>',
  alert: '<path d="M12 8v5M12 16h.01M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01"/>',
};

export function icon(name) {
  return raw(`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name] || PATHS.dots}</svg>`);
}
