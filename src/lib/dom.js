export const $ = (id) => document.getElementById(id);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Markup that is already safe to inject (built by `html` or `raw`). */
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Mark trusted markup (e.g. our own SVG strings) so `html` does not escape it. */
export const raw = (value) => new SafeHtml(value);

function render(value) {
  if (value == null || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return esc(value);
}

/** Tagged template that escapes every interpolation unless it is `raw` / nested `html`. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

export function mount(element, content) {
  element.innerHTML = render(content);
}
