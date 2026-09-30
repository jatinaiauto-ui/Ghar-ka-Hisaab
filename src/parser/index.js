/* Hinglish / Hindi / English expense parser. Pure functions, no DOM: runs in the browser and in node tests. */
import { findAmount, valueOf } from './numbers.js';

export { valueOf };

const DEV_DIGITS = '०१२३४५६७८९';

const FILLER = /(^| )(aaj|आज|kal|कल|parso|परसों|ke|ka|ki|ko|mein|me|में|के|का|की|को|par|pe|पर|liye|लिए|rupaye|rupaya|रुपये|रुपया|रुपए|rs|₹|kharcha|खर्चा|kharch|खर्च|likho|लिखो|likh|लिख|do|दो|diye|दिए|gaye|गए|lage|लगे|laga|लगा|hai|है|tha|था|the|thi|थी|spent|for|on|paid|ne|ने|dalwaya|dalwaye|dalvaya|डलवाया|डलवाए)(?= |$)/g;
const QUESTION = /(kitna|kitne|kitni|कितना|कितने|कितनी|how much|total kitna|hisaab batao|हिसाब बताओ)/;
const SEGMENT_SPLIT = /\s+(?:aur|और|and|phir|फिर|tatha|तथा)\s+|[,;।\n]+/;

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[​‌‍]/g, '')
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .replace(/(\d),(\d)/g, '$1$2')                       // 1,200 -> 1200
    .replace(/₹/g, ' ₹ ')
    .replace(/(\d)([^\d\s.])/g, '$1 $2')                  // "120rs" -> "120 rs"
    .replace(/([^\d\s.])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// Devanagari suffixes (matras/postpositions) stick to words, so only Latin keywords need word edges.
function matchesWord(text, keyword) {
  const latin = /[a-z]/.test(keyword);
  for (let idx = text.indexOf(keyword); idx !== -1; idx = text.indexOf(keyword, idx + 1)) {
    if (!latin) return true;
    const before = idx === 0 ? ' ' : text[idx - 1];
    const after = idx + keyword.length >= text.length ? ' ' : text[idx + keyword.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
  }
  return false;
}

/** Category whose longest keyword appears in the text; falls back to the "other" category. */
function pickCategory(text, categories) {
  let best = null;
  let bestLen = 0;
  categories.forEach((c) => {
    (c.keywords || []).forEach((kw) => {
      const k = String(kw).toLowerCase();
      if (k.length > bestLen && matchesWord(text, k)) { best = c; bestLen = k.length; }
    });
  });
  return best || categories.find((c) => c.slug === 'other') || null;
}

function dayOffset(text) {
  if (/(^| )(परसों|parso|parson)( |$)/.test(text)) return -2;
  if (/(^| )(कल|kal)( |$)/.test(text)) return -1;
  return 0;
}

const cleanNote = (text) => text.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

/**
 * @returns {{ text: string, question: boolean, category: object|null,
 *             items: { amount: number|null, category: object|null, note: string, offset: number }[] }}
 */
export function parse(rawText, categories) {
  const text = normalize(rawText);
  const out = { text, question: false, category: null, items: [] };
  if (!text) return out;

  if (QUESTION.test(text)) {
    const c = pickCategory(text, categories);
    out.question = true;
    out.category = c && c.slug !== 'other' ? c : null;
    return out;
  }

  const offset = dayOffset(text);
  let carry = '';
  text.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean).forEach((seg) => {
    const full = carry ? `${carry} ${seg}` : seg;
    const tokens = full.split(' ');
    const hit = findAmount(tokens);
    if (!hit) { carry = full; return; }   // "sabzi, 120": the amount arrives in the next segment
    carry = '';
    const note = cleanNote([...tokens.slice(0, hit.start), ...tokens.slice(hit.end)].join(' '));
    out.items.push({ amount: hit.amount, category: pickCategory(full, categories), note, offset });
  });
  if (carry) {
    out.items.push({ amount: null, category: pickCategory(carry, categories), note: cleanNote(carry), offset });
  }
  return out;
}
